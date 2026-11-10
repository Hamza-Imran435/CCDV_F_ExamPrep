(() => {
  const state = {
    questions: [],
    topics: [], // [{deck, title}]
    progress: null,
    setup: { difficulty: 'mixed', topic: 'all', length: 20 },
    quiz: null, // {items, index, results: [{id,deck,topic,difficulty,correct,selected,correctIndex}]}
    lastAttemptMissedIds: [],
  };

  const viewRoot = document.getElementById('view-root');

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`Request failed: ${url}`);
    return res.json();
  }

  async function loadData() {
    const [questions, progress] = await Promise.all([
      fetchJSON('/api/questions'),
      fetchJSON('/api/progress'),
    ]);
    state.questions = questions;
    state.progress = progress;

    const topicMap = new Map();
    for (const q of questions) {
      if (!topicMap.has(q.deck)) topicMap.set(q.deck, q.topic);
    }
    state.topics = Array.from(topicMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([deck, title]) => ({ deck, title }));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function filterQuestions({ difficulty, topic }) {
    return state.questions.filter((q) => {
      const diffOk = difficulty === 'mixed' || q.difficulty === difficulty;
      const topicOk = topic === 'all' || String(q.deck) === String(topic);
      return diffOk && topicOk;
    });
  }

  // Returns a copy of q with its options reordered randomly, so the correct
  // answer isn't biased toward whichever slot the source bank happened to use.
  function withShuffledOptions(q) {
    const order = shuffle(q.options.map((_, i) => i));
    return {
      ...q,
      options: order.map((i) => q.options[i]),
      answer: order.indexOf(q.answer),
    };
  }

  function buildQuizSet({ difficulty, topic, length }) {
    const pool = filterQuestions({ difficulty, topic });
    const shuffled = shuffle(pool);
    const n = length === 0 ? shuffled.length : Math.min(length, shuffled.length);
    return shuffled.slice(0, n).map(withShuffledOptions);
  }

  // ---------- Routing ----------
  function setActiveNav(view) {
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === view);
    });
  }

  function navigate(view) {
    if (view === 'home') renderHome();
    else if (view === 'progress') renderProgress();
    setActiveNav(view === 'home' || view === 'progress' ? view : '');
  }

  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });

  // ---------- Home ----------
  function computeTopicStats() {
    const byDeck = (state.progress && state.progress.stats.byDeck) || {};
    return Object.entries(byDeck)
      .map(([deck, s]) => ({
        deck,
        topic: s.topic || `Deck ${deck}`,
        attempted: s.attempted,
        correct: s.correct,
        pct: s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0,
      }))
      .sort((a, b) => a.pct - b.pct);
  }

  function renderHome() {
    const tmpl = document.getElementById('tmpl-home');
    viewRoot.innerHTML = '';
    viewRoot.appendChild(tmpl.content.cloneNode(true));

    const topicSelect = document.getElementById('topic-select');
    for (const t of state.topics) {
      const opt = document.createElement('option');
      opt.value = t.deck;
      opt.textContent = `Deck ${String(t.deck).padStart(3, '0')} — ${t.title}`;
      topicSelect.appendChild(opt);
    }
    topicSelect.value = state.setup.topic;
    topicSelect.addEventListener('change', () => {
      state.setup.topic = topicSelect.value;
      updateBankMeta();
    });

    document.querySelectorAll('#difficulty-choices .choice-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === state.setup.difficulty);
      btn.addEventListener('click', () => {
        state.setup.difficulty = btn.dataset.value;
        document.querySelectorAll('#difficulty-choices .choice-btn').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
        updateBankMeta();
      });
    });

    document.querySelectorAll('#length-choices .choice-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.value) === state.setup.length);
      btn.addEventListener('click', () => {
        state.setup.length = Number(btn.dataset.value);
        document.querySelectorAll('#length-choices .choice-btn').forEach((b) =>
          b.classList.toggle('active', b === btn)
        );
      });
    });

    function updateBankMeta() {
      const pool = filterQuestions(state.setup);
      const meta = document.getElementById('bank-meta');
      meta.textContent = `${pool.length} question${pool.length === 1 ? '' : 's'} available in the bank for this selection · ${state.questions.length} total in the syllabus.`;
    }
    updateBankMeta();

    document.getElementById('start-quiz').addEventListener('click', () => {
      startQuiz({ ...state.setup });
    });

    renderHomeSummary();
  }

  function renderHomeSummary() {
    const grid = document.getElementById('home-summary');
    const stats = state.progress.stats;
    const totalAttempted = stats.beginner.attempted + stats.medium.attempted + stats.hard.attempted;
    const totalCorrect = stats.beginner.correct + stats.medium.correct + stats.hard.correct;
    const overallPct = totalAttempted ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

    grid.innerHTML = '';
    const cards = [
      { label: 'Overall Accuracy', value: totalAttempted ? `${overallPct}%` : '—' },
      { label: 'Questions Answered', value: totalAttempted },
      { label: 'Quizzes Taken', value: state.progress.attempts.length },
      { label: 'Topics Covered', value: Object.keys(stats.byDeck).length + ' / ' + state.topics.length },
    ];
    for (const c of cards) {
      const div = document.createElement('div');
      div.className = 'stat-card';
      div.innerHTML = `<div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div>`;
      grid.appendChild(div);
    }

    const weakWrap = document.getElementById('home-weak-topics');
    const weak = computeTopicStats().filter((t) => t.attempted >= 3).slice(0, 5);
    if (weak.length === 0) {
      weakWrap.innerHTML = '<p class="muted">Answer a few quizzes to see your weakest topics here.</p>';
      return;
    }
    weakWrap.innerHTML = '<h3>Weakest Topics</h3><div class="weak-topics-list"></div>';
    const list = weakWrap.querySelector('.weak-topics-list');
    for (const t of weak) {
      const row = document.createElement('div');
      row.className = 'weak-item';
      row.innerHTML = `<span>${t.topic}</span><span class="pct">${t.pct}%</span>`;
      list.appendChild(row);
    }
  }

  // ---------- Quiz ----------
  function startQuiz(setup) {
    const items = buildQuizSet(setup);
    if (items.length === 0) {
      alert('No questions match that selection yet.');
      return;
    }
    state.quiz = {
      setup,
      items,
      index: 0,
      results: [],
    };
    renderQuiz();
    setActiveNav('');
  }

  function startRetryQuiz(ids) {
    const items = state.questions.filter((q) => ids.includes(q.id));
    if (items.length === 0) return;
    state.quiz = {
      setup: { difficulty: 'mixed', topic: 'all', length: items.length, retry: true },
      items: shuffle(items).map(withShuffledOptions),
      index: 0,
      results: [],
    };
    renderQuiz();
  }

  function renderQuiz() {
    const tmpl = document.getElementById('tmpl-quiz');
    viewRoot.innerHTML = '';
    viewRoot.appendChild(tmpl.content.cloneNode(true));
    renderQuizQuestion();

    document.getElementById('quiz-quit').addEventListener('click', () => {
      if (confirm('Quit this quiz? Progress for this quiz will not be saved.')) {
        state.quiz = null;
        navigate('home');
      }
    });
  }

  function renderQuizQuestion() {
    const q = state.quiz.items[state.quiz.index];
    const total = state.quiz.items.length;
    const idx = state.quiz.index;

    document.getElementById('quiz-counter').textContent = `Question ${idx + 1} / ${total}`;
    document.getElementById('quiz-progress-fill').style.width = `${(idx / total) * 100}%`;

    const diffTag = document.getElementById('quiz-difficulty-tag');
    diffTag.textContent = q.difficulty;
    diffTag.className = `tag tag-difficulty ${q.difficulty}`;

    document.getElementById('quiz-topic-tag').textContent = q.topic;
    document.getElementById('quiz-question').textContent = q.question;

    const optionsWrap = document.getElementById('quiz-options');
    optionsWrap.innerHTML = '';
    let selected = null;
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.innerHTML = `<span class="opt-letter">${letters[i]}</span><span>${opt}</span>`;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        optionsWrap.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        selected = i;
        document.getElementById('quiz-check').disabled = false;
      });
      optionsWrap.appendChild(btn);
    });

    const explanationBox = document.getElementById('quiz-explanation');
    explanationBox.classList.add('hidden');
    explanationBox.innerHTML = '';

    const checkBtn = document.getElementById('quiz-check');
    const nextBtn = document.getElementById('quiz-next');
    checkBtn.disabled = true;
    checkBtn.classList.remove('hidden');
    nextBtn.classList.add('hidden');

    checkBtn.onclick = () => {
      if (selected === null) return;
      const correct = selected === q.answer;
      optionsWrap.querySelectorAll('.option-btn').forEach((b, i) => {
        b.disabled = true;
        if (i === q.answer) b.classList.add('correct');
        else if (i === selected) b.classList.add('incorrect');
      });

      explanationBox.classList.remove('hidden');
      explanationBox.innerHTML = `<div class="expl-verdict ${correct ? 'good' : 'bad'}">${correct ? 'Correct' : 'Incorrect'}</div><div>${q.explanation || ''}</div>`;

      state.quiz.results.push({
        id: q.id,
        deck: q.deck,
        topic: q.topic,
        difficulty: q.difficulty,
        question: q.question,
        options: q.options,
        selected,
        correctIndex: q.answer,
        correct,
        explanation: q.explanation,
      });

      checkBtn.classList.add('hidden');
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = idx + 1 >= total ? 'See Results' : 'Next Question';
    };

    nextBtn.onclick = () => {
      if (idx + 1 >= total) {
        finishQuiz();
      } else {
        state.quiz.index += 1;
        renderQuizQuestion();
      }
    };
  }

  async function finishQuiz() {
    const results = state.quiz.results;
    const correct = results.filter((r) => r.correct).length;
    const payload = {
      difficulty: state.quiz.setup.difficulty,
      deckFilter: state.quiz.setup.topic === 'all' ? null : state.quiz.setup.topic,
      total: results.length,
      correct,
      questionResults: results.map((r) => ({
        id: r.id,
        deck: r.deck,
        topic: r.topic,
        difficulty: r.difficulty,
        correct: r.correct,
      })),
    };

    try {
      state.progress = await fetchJSON('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error('Failed to save progress', e);
    }

    state.lastAttemptMissedIds = results.filter((r) => !r.correct).map((r) => r.id);
    renderResults(results, correct);
  }

  function renderResults(results, correct) {
    const tmpl = document.getElementById('tmpl-results');
    viewRoot.innerHTML = '';
    viewRoot.appendChild(tmpl.content.cloneNode(true));

    const total = results.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;
    document.getElementById('score-percent').textContent = `${pct}%`;
    document.getElementById('score-detail').textContent = `${correct} of ${total} correct`;

    const circle = document.getElementById('score-circle');
    circle.style.borderColor = pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)';

    const byDiff = {};
    for (const r of results) {
      byDiff[r.difficulty] = byDiff[r.difficulty] || { total: 0, correct: 0 };
      byDiff[r.difficulty].total += 1;
      if (r.correct) byDiff[r.difficulty].correct += 1;
    }
    const breakdown = document.getElementById('results-breakdown');
    breakdown.innerHTML = '';
    for (const [diff, v] of Object.entries(byDiff)) {
      const div = document.createElement('div');
      div.className = 'bd-item';
      div.innerHTML = `<div class="bd-value">${v.correct}/${v.total}</div><div class="bd-label">${diff}</div>`;
      breakdown.appendChild(div);
    }

    const review = document.getElementById('results-review');
    review.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const r of results) {
      const div = document.createElement('div');
      div.className = `review-item ${r.correct ? 'correct' : 'incorrect'}`;
      div.innerHTML = `
        <div class="rq">${r.question}</div>
        <div class="ra">Your answer: ${letters[r.selected]}. ${r.options[r.selected]}</div>
        ${r.correct ? '' : `<div class="ra">Correct answer: ${letters[r.correctIndex]}. ${r.options[r.correctIndex]}</div>`}
        <div class="re">${r.explanation || ''}</div>
      `;
      review.appendChild(div);
    }

    const retryBtn = document.getElementById('results-retry-missed');
    if (state.lastAttemptMissedIds.length === 0) {
      retryBtn.disabled = true;
      retryBtn.textContent = 'No Missed Questions';
    }
    retryBtn.addEventListener('click', () => startRetryQuiz(state.lastAttemptMissedIds));
    document.getElementById('results-new').addEventListener('click', () => navigate('home'));
  }

  // ---------- Progress dashboard ----------
  function renderProgress() {
    const tmpl = document.getElementById('tmpl-progress');
    viewRoot.innerHTML = '';
    viewRoot.appendChild(tmpl.content.cloneNode(true));

    const stats = state.progress.stats;
    const totalAttempted = stats.beginner.attempted + stats.medium.attempted + stats.hard.attempted;
    const totalCorrect = stats.beginner.correct + stats.medium.correct + stats.hard.correct;
    const overallPct = totalAttempted ? Math.round((totalCorrect / totalAttempted) * 100) : 0;

    const summary = document.getElementById('progress-summary');
    const cards = [
      { label: 'Overall Accuracy', value: totalAttempted ? `${overallPct}%` : '—' },
      { label: 'Questions Answered', value: totalAttempted },
      { label: 'Quizzes Taken', value: state.progress.attempts.length },
    ];
    summary.innerHTML = cards
      .map((c) => `<div class="stat-card"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`)
      .join('');

    const byDiffWrap = document.getElementById('progress-by-difficulty');
    byDiffWrap.innerHTML = '';
    for (const diff of ['beginner', 'medium', 'hard']) {
      const s = stats[diff];
      const pct = s.attempted ? Math.round((s.correct / s.attempted) * 100) : 0;
      byDiffWrap.appendChild(barRow(`${diff} (${s.attempted})`, pct));
    }

    const byTopicWrap = document.getElementById('progress-by-topic');
    const topicStats = computeTopicStats();
    if (topicStats.length === 0) {
      byTopicWrap.innerHTML = '<div class="empty-state">No attempts yet.</div>';
    } else {
      byTopicWrap.innerHTML = '';
      for (const t of topicStats) {
        byTopicWrap.appendChild(barRow(`${t.topic} (${t.attempted})`, t.pct));
      }
    }

    const attemptsWrap = document.getElementById('progress-attempts');
    const recent = state.progress.attempts.slice(-10).reverse();
    if (recent.length === 0) {
      attemptsWrap.innerHTML = '<div class="empty-state">No quizzes taken yet.</div>';
    } else {
      attemptsWrap.innerHTML = '';
      for (const a of recent) {
        const when = new Date(a.timestamp).toLocaleString();
        const row = document.createElement('div');
        row.className = 'attempt-row';
        row.innerHTML = `<span>${when} &middot; ${a.difficulty}</span><span class="aw">${a.correct}/${a.total}</span>`;
        attemptsWrap.appendChild(row);
      }
    }

    document.getElementById('progress-reset').addEventListener('click', async () => {
      if (!confirm('This will permanently erase all saved progress. Continue?')) return;
      state.progress = await fetchJSON('/api/progress/reset', { method: 'POST' });
      renderProgress();
    });

    setActiveNav('progress');
  }

  function barRow(label, pct) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    const color = pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--warn)' : 'var(--bad)';
    row.innerHTML = `
      <span>${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="bar-pct">${pct}%</span>
    `;
    return row;
  }

  // ---------- Init ----------
  (async function init() {
    viewRoot.innerHTML = '<div class="empty-state">Loading question bank…</div>';
    try {
      await loadData();
      navigate('home');
    } catch (e) {
      viewRoot.innerHTML = `<div class="empty-state">Failed to load: ${e.message}</div>`;
    }
  })();
})();
