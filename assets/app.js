
(function () {
  'use strict';
  var LS = 'syllabus.progress.v1';

  /* ---------- progress store ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } }
  function save(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function isDone(id) { return !!load()[id]; }
  function setDone(id, v) { var o = load(); if (v) o[id] = 1; else delete o[id]; save(o); paint(); }

  function paint() {
    var done = load();
    document.querySelectorAll('.nav a[data-id]').forEach(function (a) {
      a.classList.toggle('done', !!done[a.getAttribute('data-id')]);
    });
    var total = document.querySelectorAll('.nav a[data-id]').length;
    var n = Object.keys(done).length;
    var fill = document.getElementById('pfill');
    var txt = document.getElementById('ptext');
    if (fill) fill.style.width = (total ? (n / total * 100) : 0) + '%';
    if (txt) txt.textContent = n + ' / ' + total + ' complete';
    var btn = document.getElementById('markdone');
    if (btn) {
      var id = btn.getAttribute('data-mod');
      btn.classList.toggle('ok', !!done[id]);
      btn.textContent = done[id] ? '\u2713 completed' : 'mark complete';
    }
  }

  /* ---------- reading progress ---------- */
  function readingBar() {
    var bar = document.getElementById('rbar');
    if (!bar) return;
    function upd() {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, window.scrollY / h * 100) : 0) + '%';
    }
    window.addEventListener('scroll', upd, { passive: true });
    upd();
  }

  /* ---------- KaTeX ---------- */
  function renderMath() {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(document.getElementById('content') || document.body, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false,
        errorColor: '#fb7185',
        macros: { '\\R': '\\mathbb{R}' },
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option']
      });
    } catch (e) { console.warn('katex', e); }
  }

  /* ---------- widgets ---------- */
  function mountViz() {
    if (window.__mountViz) window.__mountViz(document);
  }

  /* ---------- table of contents ---------- */
  function buildTOC() {
    var toc = document.getElementById('toc');
    if (!toc) return;
    var hs = document.querySelectorAll('#content h2');
    if (hs.length < 3) { toc.remove(); return; }
    var ol = document.createElement('ol');
    hs.forEach(function (hh, i) {
      var slug = 's' + i;
      hh.id = hh.id || slug;
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + hh.id;
      a.textContent = hh.textContent.replace('\u00b6', '').trim();
      li.appendChild(a);
      ol.appendChild(li);
      var anc = document.createElement('a');
      anc.className = 'anchor';
      anc.href = '#' + hh.id;
      anc.textContent = '\u00b6';
      hh.appendChild(anc);
    });
    toc.appendChild(ol);
  }

  /* ---------- code copy ---------- */
  function copyButtons() {
    document.querySelectorAll('pre').forEach(function (pre) {
      var b = document.createElement('button');
      b.className = 'copy';
      b.textContent = 'copy';
      b.addEventListener('click', function () {
        var txt = pre.querySelector('code') ? pre.querySelector('code').innerText : pre.innerText;
        navigator.clipboard.writeText(txt).then(function () {
          b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1200);
        }).catch(function () { b.textContent = 'failed'; });
      });
      pre.appendChild(b);
    });
  }

  /* ---------- keyboard nav ---------- */
  function keys() {
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input,select,textarea')) return;
      var p = document.getElementById('prevlink'), n = document.getElementById('nextlink');
      if (e.key === 'ArrowLeft' && p) location.href = p.href;
      if (e.key === 'ArrowRight' && n) location.href = n.href;
    });
  }

  function init() {
    renderMath();
    mountViz();
    buildTOC();
    copyButtons();
    readingBar();
    paint();
    keys();
    var btn = document.getElementById('markdone');
    if (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-mod');
        setDone(id, !isDone(id));
      });
    }
    var all = document.getElementById('cleardone');
    if (all) all.addEventListener('click', function () { save({}); paint(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
