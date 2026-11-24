const topics = [...new Set(questionBank.map(question => question.topic))];
const all = "전체 문제";
const review = "오답 노트";
const mixedTerms = "양방향 섞어 풀기";
const termModes = new Map([
  ...termDirections.map(direction => [direction.label, direction.id]),
  [mixedTerms, null],
]);
const storageKey = "anatomy-final-mistakes-v1";
const questionsById = new Map(
  [...questionBank, ...termQuestionBank].map(question => [question.id, question]),
);
const title = document.querySelector("#session-title");
const panel = document.querySelector("#panel");
const progress = document.querySelector("#progress");
const position = document.querySelector("#position");
const reviewButton = document.querySelector("#review");
const reviewCount = document.querySelector("#review-count");
const settings = document.querySelector("#settings");
const difficulty = document.querySelector("#difficulty");
const length = document.querySelector("#length");
const modeButtons = new Map();
const mistakes = loadMistakes();
let session;
let studyMode = all;
let preferredLength = length.value;

function loadMistakes() {
  try {
    const ids = JSON.parse(localStorage.getItem(storageKey));
    return new Set(Array.isArray(ids) ? ids.filter(id => questionsById.has(id)) : []);
  } catch {
    return new Set();
  }
}

function saveMistakes() {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...mistakes]));
  } catch {
    // Keep review available in the current tab when storage is disabled.
  }
  reviewCount.textContent = mistakes.size;
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, style, action) {
  const node = element("button", style, label);
  node.type = "button";
  if (action) node.addEventListener("click", action);
  return node;
}

function questionsFor(mode) {
  if (mode === all) return questionBank;
  if (mode === review) return [...mistakes].map(id => questionsById.get(id));
  if (termModes.has(mode)) {
    const direction = termModes.get(mode);
    return termQuestionBank.filter(question => !direction || question.direction === direction);
  }
  return questionBank.filter(question => question.topic === mode);
}

function filteredQuestions(mode) {
  const candidates = questionsFor(mode);
  if (termModes.has(mode) || !difficulty.value) return candidates;
  return candidates.filter(question => question.difficulty === difficulty.value);
}

function updateLengths() {
  const available = filteredQuestions(studyMode).length;
  for (const option of length.options) {
    option.disabled = option.value !== "all" && Number(option.value) >= available;
    if (option.value === "all") option.textContent = "전체 " + available + "문항";
  }
  length.value = preferredLength;
  if (length.selectedOptions[0].disabled) length.value = "all";
}

function practice(mode, focus = true) {
  studyMode = mode;
  updateLengths();
  const candidates = filteredQuestions(mode);
  const limit = length.value === "all" ? candidates.length : Number(length.value);
  start(mode, candidates, focus, limit);
}

function start(mode, questions = questionsFor(mode), focus = true, limit = questions.length) {
  session = {
    mode,
    questions: shuffle(questions).slice(0, limit),
    index: 0,
    correct: 0,
    missed: [],
  };
  title.textContent = mode;
  for (const [name, modeButton] of modeButtons) {
    modeButton.setAttribute("aria-pressed", String(name === mode));
  }
  reviewButton.setAttribute("aria-pressed", String(mode === review));
  settings.hidden = mode === review;
  difficulty.closest("label").hidden = termModes.has(mode);
  if (questions.length) renderQuestion();
  else renderEmpty();
  if (focus) panel.querySelector("[tabindex]").focus();
}

function showProgress(answered) {
  const total = session.questions.length;
  progress.hidden = total === 0;
  progress.max = total || 1;
  progress.value = answered;
  position.textContent = total ? "문항 " + Math.min(session.index + 1, total) + " / " + total : "";
}

function renderQuestion() {
  showProgress(session.index);
  const question = session.questions[session.index];
  const category = element("p", "category", question.topic);
  if (question.direction) {
    category.append(element("span", "difficulty direction", question.directionLabel));
  } else {
    const level = element("span", "difficulty", "난이도 " + question.difficulty);
    level.dataset.level = question.difficulty;
    category.append(level);
  }
  const heading = element("h3", "question", question.prompt);
  if (question.promptLanguage) heading.lang = question.promptLanguage;
  heading.id = "current-question";
  heading.tabIndex = -1;
  const questionLine = element("div", "question-line");
  questionLine.append(heading);
  if (question.emphasis) {
    const badge = element("span", "exam-priority", question.emphasis === "red" ? "최우선" : "중요");
    badge.dataset.color = question.emphasis;
    questionLine.append(badge);
  }
  const form = element("form");
  const options = element("fieldset", "options");
  options.setAttribute("aria-labelledby", heading.id);
  const feedback = element("div", "feedback");
  feedback.tabIndex = -1;
  feedback.setAttribute("role", "status");
  const actions = element("div", "actions");
  const check = button("정답 확인", "primary");
  check.type = "submit";
  check.disabled = true;
  let answered = false;

  const choices = shuffle([question.answer, ...question.distractors]).map((value, index) => {
    const label = element("label", "option");
    const input = element("input", "sr-only");
    input.type = "radio";
    input.name = "answer";
    input.value = value;
    input.addEventListener("change", () => { check.disabled = false; });
    const number = element("span", "option-number", String(index + 1));
    number.setAttribute("aria-hidden", "true");
    const answerText = element("span", "", value);
    if (question.answerLanguage) answerText.lang = question.answerLanguage;
    label.append(input, number, answerText);
    options.append(label);
    return { label, input, value };
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const chosen = choices.find(choice => choice.input.checked);
    if (!chosen || answered) return;
    answered = true;
    const correct = chosen.value === question.answer;
    if (correct) {
      session.correct += 1;
      mistakes.delete(question.id);
    } else {
      session.missed.push(question);
      mistakes.add(question.id);
    }
    saveMistakes();
    showProgress(session.index + 1);

    for (const choice of choices) {
      choice.input.disabled = true;
      if (choice.value === question.answer) {
        choice.label.dataset.result = "correct";
        choice.label.append(element("span", "option-result", "정답"));
      } else if (choice === chosen) {
        choice.label.dataset.result = "wrong";
        choice.label.append(element("span", "option-result", "오답"));
      }
    }

    feedback.dataset.correct = String(correct);
    feedback.append(
      element("strong", "", correct ? "정답입니다!" : "정답 · " + question.answer),
      element("p", "", question.explanation),
      element("p", "source", "근거 · " + question.topic + " 교안 · PDF " + question.pages + "쪽"),
    );

    const last = session.index === session.questions.length - 1;
    actions.replaceChildren(button(last ? "결과 보기" : "다음 문제", "primary", () => {
      if (last) {
        renderResult();
      } else {
        session.index += 1;
        renderQuestion();
      }
      panel.querySelector("[tabindex]").focus();
    }));
    feedback.focus();
  });

  actions.append(check);
  form.append(options, feedback, actions);
  panel.replaceChildren(category, questionLine, form);
}

function renderResult() {
  showProgress(session.questions.length);
  position.textContent = "완료";
  const mode = session.mode;
  const questions = session.questions;
  const score = Math.round(session.correct * 1000 / questions.length) / 10;
  const result = element("div", "result");
  const heading = element("h3", "question", "학습 결과");
  heading.tabIndex = -1;
  const actions = element("div", "actions");
  if (mode !== review) {
    actions.append(button("다시 풀기", "secondary", () => start(mode, questions)));
  } else {
    actions.append(button("전체 문제 풀기", "secondary", () => practice(all)));
  }
  if (session.missed.length) {
    actions.append(button("이번 오답 다시 풀기", "primary", () => start(review, session.missed)));
  }
  result.append(
    heading,
    element("div", "result-score", score + "점"),
    element("p", "", questions.length + "문항 중 " + session.correct + "문항을 맞혔어요."),
    actions,
  );
  panel.replaceChildren(result);
}

function renderEmpty() {
  showProgress(0);
  const heading = element("h3", "question", "복습할 오답이 없어요.");
  heading.tabIndex = -1;
  const actions = element("div", "actions");
  actions.append(button("전체 문제 풀기", "primary", () => practice(all)));
  panel.replaceChildren(heading, actions);
}

function renderModeButtons(navigation, modes) {
  for (const mode of modes) {
    const modeButton = button("", "topic", () => practice(mode));
    modeButton.append(
      element("span", "", mode),
      element("span", "", questionsFor(mode).length + "문항"),
    );
    modeButtons.set(mode, modeButton);
    navigation.append(modeButton);
  }
}

renderModeButtons(document.querySelector("#topics"), [all, ...topics]);
renderModeButtons(document.querySelector("#terms"), [...termModes.keys()]);
reviewButton.addEventListener("click", () => start(review));
reviewCount.textContent = mistakes.size;
difficulty.addEventListener("change", updateLengths);
length.addEventListener("change", () => { preferredLength = length.value; });
settings.addEventListener("submit", event => {
  event.preventDefault();
  practice(studyMode);
});
practice(all, false);
