/* ============================================================
   SIGNALEMENT & SUGGESTIONS (formulaire en 5 étapes)
   ============================================================
   Du plus large au plus fin :
     1. Sujet         — une grande famille (suggestion, défi, interface…)
     2. Précision     — les sous-sujets concernés (plusieurs choix) + portée
     3. Détails       — gravité, fréquence, description, étapes, attendu/obtenu
     4. Capture       — capture de la page ou image importée (facultatif)
     5. Récapitulatif — vérification puis envoi
   Le contexte technique (niveau, défi, requête, dernier résultat,
   appareil…) est joint automatiquement si l'utilisateur l'accepte.

   Stockage : collection Firestore « reports » (voir firestore.rules).
   Les captures sont compressées en JPEG et stockées dans le document
   (limite Firestore : 1 Mo par document). En cas d'échec, le rapport
   est mis en file d'attente sur l'appareil et renvoyé plus tard.
   ============================================================ */

(function () {
  "use strict";

  var QUEUE_KEY = 'queryreal_report_queue';
  var MAX_SHOTS = 3;
  var SHOT_MAX_CHARS = 260000;   // ~190 Ko par image, 3 images < 1 Mo
  var SHOT_MAX_DIM = 1400;

  // ------------------------------------------------------------------
  // 1. TAXONOMIE (grosse maille → maille fine)
  // ------------------------------------------------------------------
  var CATEGORIES = [
    { id: 'suggestion', ico: '💡', label: "Conseil d'amélioration", sub: 'Une idée, une envie, un manque', bug: false,
      topics: ['Nouveaux défis', 'Nouveaux niveaux ou jeux de données', 'Explications et indices', 'Correction / solution après validation',
               'Design et couleurs', 'Expérience sur téléphone', 'Accessibilité', 'Suivi de progression / statistiques',
               'Classement / aspect jeu', 'Autre idée'] },
    { id: 'query', ico: '🧩', label: 'Problème sur un défi', sub: 'Énoncé, validation, résultat attendu', bug: true,
      topics: ['Ma requête correcte est refusée', 'Le résultat attendu me semble faux', 'Énoncé peu clair ou ambigu',
               'Ordre de tri / nombre de lignes', "Indice inutile ou trompeur", '« Erreur interne de validation »',
               'Défi trop difficile', 'Défi trop facile', 'Autre'] },
    { id: 'interface', ico: '🖥️', label: "Problème d'interface", sub: 'Affichage, boutons, navigation', bug: true,
      topics: ['Mise en page cassée / qui déborde', 'Bouton qui ne réagit pas', 'Texte illisible / contraste',
               'Navigation confuse', 'Éditeur SQL', 'Panneaux Schéma / Aide SQL', 'Tableau de résultats',
               'Thème clair / sombre', 'Autre'] },
    { id: 'data', ico: '🗄️', label: 'Problème de données', sub: 'Base, schéma, sources', bug: true,
      topics: ['La base ne se charge pas', 'Données de secours au lieu des données en direct',
               'Données incohérentes ou manquantes', 'Schéma mal documenté', 'Source ou lien incorrect', 'Autre'] },
    { id: 'account', ico: '🔐', label: 'Compte et sauvegarde', sub: 'Connexion, progression, synchro', bug: true,
      topics: ['Connexion impossible', 'Connexion Google / GitHub', 'Création de compte', 'Progression perdue',
               'Synchronisation entre appareils', 'Mode invité', 'Autre'] },
    { id: 'perf', ico: '⚡', label: 'Lenteur ou plantage', sub: 'Chargement, gel, crash', bug: true,
      topics: ['Chargement de la base très long', 'Page qui se fige', 'Requête très lente', 'Le navigateur plante', 'Autre'] },
    { id: 'other', ico: '💬', label: 'Autre', sub: 'Tout le reste', bug: false,
      topics: ['Question', 'Contenu pédagogique', 'Remerciement / retour général', 'Autre'] }
  ];

  var SCOPES = [
    { id: 'challenge', label: 'Ce défi précis' },
    { id: 'level', label: 'Tout ce niveau' },
    { id: 'platform', label: 'Toute la plateforme' }
  ];
  var SEVERITIES = [
    { id: 'blocking', label: '🔴 Bloquant' },
    { id: 'annoying', label: '🟠 Gênant' },
    { id: 'minor', label: '🟡 Mineur' },
    { id: 'idea', label: '💡 Simple idée' }
  ];
  var FREQUENCIES = [
    { id: 'always', label: 'À chaque fois' },
    { id: 'sometimes', label: 'Parfois' },
    { id: 'once', label: 'Une seule fois' }
  ];
  var STEP_LABELS = ['Sujet', 'Précision', 'Détails', "Capture d'écran", 'Envoi'];

  // ------------------------------------------------------------------
  // 2. ÉTAT
  // ------------------------------------------------------------------
  var state;
  function resetState() {
    state = {
      step: 0, category: null, topics: [], scope: null, severity: null, frequency: null,
      title: '', description: '', steps: '', expected: '', observed: '', benefit: '',
      email: '', includeContext: true, shots: [], context: null, sent: false, sending: false
    };
  }

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cat() { return CATEGORIES.find(function (c) { return c.id === state.category; }); }
  function opt(list, id) { var o = list.find(function (x) { return x.id === id; }); return o ? o.label : '—'; }

  // ------------------------------------------------------------------
  // 3. CONTEXTE AUTOMATIQUE
  // ------------------------------------------------------------------
  function activePageId() {
    var p = document.querySelector('.page.active');
    return p ? p.id.replace('page-', '') : 'inconnue';
  }

  function collectContext() {
    var page = activePageId();
    var ctx = {
      page: page,
      url: location.href.split('#')[0],
      userAgent: navigator.userAgent,
      viewport: window.innerWidth + 'x' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x',
      device: window.matchMedia('(pointer: coarse)').matches ? 'tactile' : 'souris',
      theme: document.documentElement.getAttribute('data-theme') || 'dark',
      language: navigator.language,
      guest: typeof isGuest !== 'undefined' && !!isGuest,
      clientTime: new Date().toISOString()
    };
    if (page === 'game' && typeof levels !== 'undefined') {
      var lvl = levels[currentLevel];
      var ch = lvl && lvl.challenges[currentChallengeIndex];
      ctx.level = currentLevel;
      ctx.levelLabel = lvl ? lvl.label : '';
      ctx.challengeNumber = currentChallengeIndex + 1;
      ctx.challengeTitle = ch ? ch.title : '';
      ctx.query = ($('sql-input') && $('sql-input').value || '').slice(0, 4000);
      ctx.lastFeedback = typeof lastFeedbackText === 'string' ? lastFeedbackText : '';
      var dbObj = typeof dbCache !== 'undefined' ? dbCache[currentLevel] : null;
      ctx.dataSource = dbObj ? (dbObj.__queryRealDataSource || '') : 'non chargée';
    }
    return ctx;
  }

  function contextSummary(ctx) {
    var lines = [];
    if (ctx.page === 'game') {
      lines.push('Niveau : ' + ctx.levelLabel + ' — défi ' + ctx.challengeNumber + ' « ' + ctx.challengeTitle + ' »');
      lines.push('Données : ' + ctx.dataSource);
      lines.push('Requête : ' + (ctx.query ? ctx.query.replace(/\s+/g, ' ').slice(0, 300) : '(vide)'));
      if (ctx.lastFeedback) lines.push('Dernier résultat : ' + ctx.lastFeedback.replace(/\s+/g, ' ').slice(0, 200));
    } else {
      lines.push('Page : ' + ctx.page);
    }
    lines.push('Appareil : ' + ctx.device + ', écran ' + ctx.viewport + ', thème ' + ctx.theme);
    lines.push('Navigateur : ' + ctx.userAgent);
    lines.push('Compte : ' + (ctx.guest ? 'invité' : 'connecté'));
    return lines.join('\n');
  }

  // ------------------------------------------------------------------
  // 4. RENDU DES ÉTAPES
  // ------------------------------------------------------------------
  function renderProgress() {
    $('wiz-progress').innerHTML = STEP_LABELS.map(function (_, i) {
      return '<span class="' + (i <= state.step ? 'on' : '') + '"></span>';
    }).join('');
    $('wiz-step-label').textContent = state.sent ? '' : 'Étape ' + (state.step + 1) + ' / ' + STEP_LABELS.length + ' — ' + STEP_LABELS[state.step];
  }

  function radioCards(name, items, selected) {
    return '<div class="choice-grid">' + items.map(function (c) {
      return '<label class="choice' + (selected === c.id ? ' checked' : '') + '">' +
        '<input type="radio" name="' + name + '" value="' + c.id + '"' + (selected === c.id ? ' checked' : '') + '>' +
        '<span><span class="c-ico" aria-hidden="true">' + c.ico + '</span> <strong>' + esc(c.label) + '</strong>' +
        '<span class="c-sub">' + esc(c.sub) + '</span></span></label>';
    }).join('') + '</div>';
  }

  function chips(name, items, selected, multi) {
    return '<div class="chip-row" role="group">' + items.map(function (it) {
      var id = typeof it === 'string' ? it : it.id;
      var label = typeof it === 'string' ? it : it.label;
      var on = multi ? selected.indexOf(id) !== -1 : selected === id;
      return '<label class="chip"><input type="' + (multi ? 'checkbox' : 'radio') + '" name="' + name +
        '" value="' + esc(id) + '"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
    }).join('') + '</div>';
  }

  function textField(id, label, value, opts) {
    opts = opts || {};
    var max = opts.max || 2000;
    var tag = opts.multiline
      ? '<textarea class="field" id="' + id + '" maxlength="' + max + '" rows="' + (opts.rows || 3) + '" placeholder="' + esc(opts.ph || '') + '">' + esc(value) + '</textarea>'
      : '<input class="field" id="' + id + '" type="' + (opts.type || 'text') + '" maxlength="' + max + '" placeholder="' + esc(opts.ph || '') + '" value="' + esc(value) + '">';
    return '<div class="wiz-q">' + label + '</div>' + tag +
      (opts.multiline ? '<div class="counter" data-for="' + id + '">' + value.length + ' / ' + max + '</div>' : '');
  }

  function render() {
    renderProgress();
    var body = $('report-body');
    var prev = $('wiz-prev'), next = $('wiz-next');
    $('report-foot').style.display = state.sent ? 'none' : '';
    prev.style.visibility = state.step === 0 ? 'hidden' : 'visible';
    next.disabled = state.sending;
    next.textContent = state.step === 4 ? (state.sending ? 'Envoi…' : 'Envoyer le signalement ✓') : 'Continuer →';

    if (state.sent) return; // écran final géré par showDone()
    var c = cat();
    var html = '';

    if (state.step === 0) {
      html += '<div class="wiz-q">De quoi souhaitez-vous nous parler ?</div>';
      html += radioCards('category', CATEGORIES, state.category);
    }

    if (state.step === 1) {
      html += '<div class="wiz-q">' + c.ico + ' ' + esc(c.label) + ' : qu\'est-ce qui est concerné ? <small>(plusieurs choix possibles)</small></div>';
      html += chips('topics', c.topics, state.topics, true);
      html += '<div class="wiz-q">Cela concerne…</div>';
      html += chips('scope', SCOPES, state.scope, false);
    }

    if (state.step === 2) {
      html += '<div class="wiz-q">' + (c.bug ? 'Quelle est la gravité ?' : 'Quelle importance pour vous ?') + '</div>';
      html += chips('severity', SEVERITIES, state.severity, false);
      if (c.bug) {
        html += '<div class="wiz-q">À quelle fréquence ?</div>';
        html += chips('frequency', FREQUENCIES, state.frequency, false);
      }
      html += textField('f-title', 'Un titre court', state.title, { max: 120, ph: c.bug ? 'Ex. : ma requête avec GROUP BY est refusée' : 'Ex. : ajouter un défi sur les jointures multiples' });
      html += textField('f-description', 'Décrivez en détail <small>(obligatoire)</small>', state.description, { multiline: true, rows: 4, max: 4000,
        ph: c.bug ? 'Que s\'est-il passé ? Le plus de détails possible…' : 'Votre idée, ce qui vous manque, ce qui vous gêne…' });
      if (c.bug) {
        html += textField('f-steps', 'Étapes pour reproduire <small>(facultatif)</small>', state.steps, { multiline: true, rows: 3, max: 2000, ph: '1. Je vais sur…\n2. J\'écris…\n3. Je clique sur…' });
        html += '<div class="field-row"><div>' +
          textField('f-expected', 'Ce que j\'attendais', state.expected, { multiline: true, rows: 2, max: 1000 }) + '</div><div>' +
          textField('f-observed', 'Ce que j\'ai obtenu', state.observed, { multiline: true, rows: 2, max: 1000 }) + '</div></div>';
      } else {
        html += textField('f-benefit', 'Qu\'est-ce que cela vous apporterait ? <small>(facultatif)</small>', state.benefit, { multiline: true, rows: 2, max: 1000 });
      }
      html += '<label class="check-line"><input type="checkbox" id="f-context"' + (state.includeContext ? ' checked' : '') + '>' +
        '<span>Joindre le contexte technique (page, défi, requête, dernier résultat, appareil)</span></label>';
      html += '<div class="context-box" id="f-context-box"' + (state.includeContext ? '' : ' hidden') + '>' + esc(contextSummary(state.context)) + '</div>';
      var defaultEmail = (typeof currentUser !== 'undefined' && currentUser && currentUser.email) || '';
      html += textField('f-email', 'E-mail pour vous répondre <small>(facultatif)</small>', state.email || defaultEmail, { type: 'email', max: 200, ph: 'vous@exemple.fr' });
    }

    if (state.step === 3) {
      html += '<p>Une image vaut mieux qu\'un long discours : ajoutez une capture pour appuyer votre signalement (facultatif, ' + MAX_SHOTS + ' maximum).</p>';
      html += '<div class="shot-actions">' +
        '<button type="button" class="btn-ghost" id="shot-capture">📸 Capturer la page</button>' +
        '<button type="button" class="btn-ghost" id="shot-import">🖼️ Importer une image</button>' +
        '<input type="file" id="shot-file" accept="image/*" multiple hidden></div>';
      html += '<p class="fb-muted" style="margin-top:8px">Sur téléphone : faites une capture avec votre appareil, puis « Importer une image ».</p>';
      html += state.shots.map(function (s, i) {
        return '<div class="shot-preview"><img src="' + s.dataUrl + '" alt="Capture ' + (i + 1) + '">' +
          '<button type="button" class="icon-btn" data-remove="' + i + '" aria-label="Retirer la capture" style="background:var(--surface)">✕</button>' +
          '<div class="shot-meta">' + esc(s.source) + ' — ' + s.width + '×' + s.height + ' px, ' + Math.round(s.dataUrl.length * 0.75 / 1024) + ' Ko</div></div>';
      }).join('');
    }

    if (state.step === 4) {
      html += '<p>Vérifiez votre signalement avant de l\'envoyer.</p><dl class="recap">' +
        '<dt>Sujet</dt><dd>' + c.ico + ' ' + esc(c.label) + '</dd>' +
        '<dt>Précision</dt><dd>' + esc(state.topics.join(' · ')) + ' — ' + esc(opt(SCOPES, state.scope)) + '</dd>' +
        '<dt>' + (c.bug ? 'Gravité / fréquence' : 'Importance') + '</dt><dd>' + esc(opt(SEVERITIES, state.severity)) +
          (c.bug ? ' · ' + esc(opt(FREQUENCIES, state.frequency)) : '') + '</dd>' +
        (state.title ? '<dt>Titre</dt><dd>' + esc(state.title) + '</dd>' : '') +
        '<dt>Description</dt><dd>' + esc(state.description).replace(/\n/g, '<br>') + '</dd>' +
        '<dt>Captures</dt><dd>' + (state.shots.length ? state.shots.length + ' image(s)' : 'aucune') + '</dd>' +
        '<dt>Contexte technique</dt><dd>' + (state.includeContext ? 'joint' : 'non joint') + '</dd>' +
        (state.email ? '<dt>Réponse à</dt><dd>' + esc(state.email) + '</dd>' : '') +
        '</dl>';
    }

    html += '<div class="wiz-error" id="wiz-error" role="alert"></div>';
    body.innerHTML = html;
    body.scrollTop = 0;
    bindPane();
  }

  // Lecture des champs de l'étape courante dans l'état
  function readPane() {
    var body = $('report-body');
    if (state.step === 0) {
      var r = body.querySelector('input[name="category"]:checked');
      var newCat = r ? r.value : null;
      if (newCat !== state.category) { state.topics = []; }
      state.category = newCat;
    }
    if (state.step === 1) {
      state.topics = Array.from(body.querySelectorAll('input[name="topics"]:checked')).map(function (i) { return i.value; });
      var s = body.querySelector('input[name="scope"]:checked');
      state.scope = s ? s.value : null;
    }
    if (state.step === 2) {
      var sev = body.querySelector('input[name="severity"]:checked');
      var fr = body.querySelector('input[name="frequency"]:checked');
      state.severity = sev ? sev.value : null;
      state.frequency = fr ? fr.value : null;
      ['title', 'description', 'steps', 'expected', 'observed', 'benefit', 'email'].forEach(function (k) {
        var el = $('f-' + k);
        if (el) state[k] = el.value.trim();
      });
      state.includeContext = $('f-context').checked;
    }
  }

  function validate() {
    var c = cat();
    if (state.step === 0 && !state.category) return 'Choisissez un sujet.';
    if (state.step === 1 && !state.topics.length) return 'Cochez au moins un élément concerné.';
    if (state.step === 1 && !state.scope) return 'Indiquez ce que cela concerne.';
    if (state.step === 2) {
      if (!state.severity) return c.bug ? 'Indiquez la gravité.' : 'Indiquez l\'importance.';
      if (c.bug && !state.frequency) return 'Indiquez la fréquence.';
      if (state.description.length < 10) return 'Décrivez la situation en quelques mots (10 caractères minimum).';
      if (state.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) return 'L\'adresse e-mail semble invalide.';
    }
    return '';
  }

  function showError(msg) { var e = $('wiz-error'); if (e) e.textContent = msg; }

  function bindPane() {
    var body = $('report-body');

    // Choix d'un sujet : on passe directement à l'étape suivante
    body.querySelectorAll('input[name="category"]').forEach(function (i) {
      i.addEventListener('change', function () {
        readPane();
        setTimeout(function () { go(1); }, 120);
      });
    });

    // Compteurs de caractères
    body.querySelectorAll('textarea.field').forEach(function (t) {
      t.addEventListener('input', function () {
        var c = body.querySelector('.counter[data-for="' + t.id + '"]');
        if (c) c.textContent = t.value.length + ' / ' + t.maxLength;
      });
    });

    var ctxBox = $('f-context');
    if (ctxBox) ctxBox.addEventListener('change', function () { $('f-context-box').hidden = !ctxBox.checked; });

    if (state.step === 3) {
      $('shot-capture').addEventListener('click', capturePage);
      $('shot-import').addEventListener('click', function () { $('shot-file').click(); });
      $('shot-file').addEventListener('change', function (e) { importFiles(e.target.files); e.target.value = ''; });
      body.querySelectorAll('[data-remove]').forEach(function (b) {
        b.addEventListener('click', function () { state.shots.splice(+b.dataset.remove, 1); render(); });
      });
    }
  }

  function go(delta) {
    readPane();
    if (delta > 0) {
      var err = validate();
      if (err) return showError(err);
    }
    state.step = Math.max(0, Math.min(4, state.step + delta));
    render();
  }

  // ------------------------------------------------------------------
  // 5. CAPTURES D'ÉCRAN
  // ------------------------------------------------------------------
  function canAddShot() {
    if (state.shots.length >= MAX_SHOTS) { showError('Maximum ' + MAX_SHOTS + ' captures.'); return false; }
    return true;
  }

  // Redimensionne + compresse en JPEG jusqu'à tenir dans la limite
  function compressCanvas(src) {
    var w = src.width, h = src.height;
    var ratio = Math.min(1, SHOT_MAX_DIM / Math.max(w, h));
    var out;
    for (var attempt = 0; attempt < 6; attempt++) {
      var cw = Math.max(1, Math.round(w * ratio)), ch = Math.max(1, Math.round(h * ratio));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(src, 0, 0, cw, ch);
      var q = 0.8;
      out = c.toDataURL('image/jpeg', q);
      while (out.length > SHOT_MAX_CHARS && q > 0.45) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      if (out.length <= SHOT_MAX_CHARS) return { dataUrl: out, width: cw, height: ch };
      ratio *= 0.75;
    }
    return { dataUrl: out, width: Math.round(w * ratio), height: Math.round(h * ratio) };
  }

  function capturePage() {
    if (!canAddShot()) return;
    if (typeof html2canvas !== 'function') {
      return showError('La capture automatique n\'est pas disponible ici. Utilisez « Importer une image ».');
    }
    var btn = $('shot-capture');
    btn.disabled = true; btn.textContent = '⏳ Capture…';
    var modal = $('report-modal');
    modal.style.visibility = 'hidden';
    var bg = getComputedStyle(document.body).backgroundColor;
    // Capture de la zone visible de l'écran, sans la fenêtre de signalement
    html2canvas(document.body, {
      backgroundColor: bg,
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      x: window.scrollX, y: window.scrollY,
      width: window.innerWidth, height: window.innerHeight,
      logging: false,
      ignoreElements: function (el) {
        return el.id === 'report-modal' || el.id === 'report-fab' || el.id === 'toast' ||
          (el.classList && el.classList.contains('confetti'));
      }
    }).then(function (canvas) {
      var r = compressCanvas(canvas);
      state.shots.push({ dataUrl: r.dataUrl, width: r.width, height: r.height, source: 'Capture de la page' });
    }).catch(function (e) {
      console.error('[feedback] capture échouée :', e);
      setTimeout(function () { showError('Capture impossible sur ce navigateur. Utilisez « Importer une image ».'); }, 0);
    }).finally(function () {
      modal.style.visibility = '';
      render();
    });
  }

  function importFiles(files) {
    Array.from(files || []).forEach(function (file) {
      if (!file.type.startsWith('image/')) return showError('Seules les images sont acceptées.');
      if (!canAddShot()) return;
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        if (state.shots.length >= MAX_SHOTS) { URL.revokeObjectURL(url); return; }
        var r = compressCanvas(img);
        URL.revokeObjectURL(url);
        state.shots.push({ dataUrl: r.dataUrl, width: r.width, height: r.height, source: file.name.slice(0, 80) });
        render();
      };
      img.onerror = function () { URL.revokeObjectURL(url); showError('Image illisible : ' + file.name); };
      img.src = url;
    });
  }

  // ------------------------------------------------------------------
  // 6. ENVOI
  // ------------------------------------------------------------------
  function buildReport() {
    var c = cat();
    var user = typeof currentUser !== 'undefined' ? currentUser : null;
    return {
      version: 1,
      category: c.id,
      categoryLabel: c.label,
      topics: state.topics,
      scope: state.scope,
      severity: state.severity,
      frequency: c.bug ? state.frequency : null,
      title: state.title,
      description: state.description,
      stepsToReproduce: c.bug ? state.steps : '',
      expected: c.bug ? state.expected : '',
      observed: c.bug ? state.observed : '',
      benefit: c.bug ? '' : state.benefit,
      contactEmail: state.email || null,
      uid: user ? user.uid : null,
      context: state.includeContext ? state.context : { page: state.context.page },
      screenshots: state.shots.map(function (s) { return { dataUrl: s.dataUrl, width: s.width, height: s.height, source: s.source }; }),
      status: 'new'
    };
  }

  function sendToFirestore(report) {
    var payload = Object.assign({}, report, { createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('Délai dépassé')); }, 15000);
    });
    return Promise.race([db.collection('reports').add(payload), timeout]);
  }

  function queueLocally(report) {
    var q = [];
    try { q = JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { /* ignore */ }
    q.push(report);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); return true; }
    catch (e) {
      // Trop lourd pour le stockage local : on garde le texte, sans images
      q[q.length - 1] = Object.assign({}, report, { screenshots: [], screenshotsDropped: report.screenshots.length });
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); return true; } catch (e2) { return false; }
    }
  }

  // Renvoie les signalements restés en attente (réseau coupé, etc.)
  function flushQueue() {
    var q;
    try { q = JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch (e) { return; }
    if (!q.length) return;
    var remaining = [];
    q.reduce(function (p, report) {
      return p.then(function () {
        return sendToFirestore(report).catch(function () { remaining.push(report); });
      });
    }, Promise.resolve()).then(function () {
      try {
        if (remaining.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
        else localStorage.removeItem(QUEUE_KEY);
      } catch (e) { /* ignore */ }
      if (remaining.length < q.length) console.log('[feedback] ' + (q.length - remaining.length) + ' signalement(s) en attente envoyé(s).');
    });
  }

  function downloadReport(report) {
    var blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'queryreal-signalement-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function showDone(ok, report, queued) {
    state.sent = true;
    renderProgress();
    $('report-foot').style.display = 'none';
    var html = ok
      ? '<div class="done-state"><div class="big">🙏</div><h3 style="font-family:var(--mono);margin-bottom:8px">Merci !</h3>' +
        '<p>Votre signalement a bien été envoyé. Chaque retour aide à améliorer QueryReal.</p>'
      : '<div class="done-state"><div class="big">📡</div><h3 style="font-family:var(--mono);margin-bottom:8px">Envoi impossible pour le moment</h3>' +
        '<p>' + (queued ? 'Votre signalement est gardé sur cet appareil et sera renvoyé automatiquement à votre prochaine visite.'
                         : 'Votre signalement n\'a pas pu être enregistré.') + '</p>' +
        '<p>Vous pouvez aussi le télécharger pour le transmettre vous-même.</p>' +
        '<button type="button" class="btn-ghost" id="report-download">⬇️ Télécharger le signalement</button>';
    html += '<div style="margin-top:18px"><button type="button" class="btn-primary" style="padding:10px 22px" id="report-finish">Fermer</button></div></div>';
    $('report-body').innerHTML = html;
    $('report-finish').addEventListener('click', closeReport);
    var dl = $('report-download');
    if (dl) dl.addEventListener('click', function () { downloadReport(report); });
  }

  function submit() {
    if (state.sending) return;
    state.sending = true;
    render();
    var report = buildReport();
    sendToFirestore(report).then(function () {
      showDone(true, report);
    }).catch(function (e) {
      console.error('[feedback] envoi échoué :', e);
      var queued = queueLocally(Object.assign({}, report, { queuedAt: new Date().toISOString() }));
      showDone(false, report, queued);
    }).finally(function () {
      state.sending = false;
    });
  }

  // ------------------------------------------------------------------
  // 7. OUVERTURE / FERMETURE
  // ------------------------------------------------------------------
  function openReport(presetCategory) {
    resetState();
    state.context = collectContext();
    // Depuis un défi, la portée « ce défi » est proposée par défaut
    if (state.context.page === 'game') state.scope = 'challenge';
    if (presetCategory) { state.category = presetCategory; state.step = 1; }
    render();
    openModal('report-modal');
  }

  function closeReport() {
    var dirty = !state.sent && (state.category || state.description || state.shots.length);
    if (dirty && !confirm('Fermer le formulaire ? Votre signalement en cours sera perdu.')) return;
    closeModal('report-modal');
  }

  document.addEventListener('DOMContentLoaded', function () {
    resetState();
    $('report-fab').addEventListener('click', function () { openReport(); });
    $('report-close').addEventListener('click', closeReport);
    $('wiz-prev').addEventListener('click', function () { go(-1); });
    $('wiz-next').addEventListener('click', function () {
      if (state.step === 4) submit(); else go(1);
    });
    // Le clic sur le fond et la touche Échap passent aussi par la confirmation
    $('report-modal').addEventListener('click', function (e) {
      if (e.target === $('report-modal')) { e.stopImmediatePropagation(); closeReport(); }
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('report-modal').classList.contains('open')) {
        e.stopImmediatePropagation(); closeReport();
      }
    }, true);
    setTimeout(flushQueue, 4000);
  });

  window.openReport = openReport;
})();