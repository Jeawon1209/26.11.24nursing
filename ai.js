const aiTutor = (() => {
  const model = "gemini-3.8-flash";
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
  const settings = document.querySelector("#ai-settings");
  const form = document.querySelector("#ai-key-form");
  const keyInput = document.querySelector("#ai-key");
  const keyStatus = document.querySelector("#ai-key-status");
  const clearKey = document.querySelector("#ai-clear-key");
  let key = "";
  let activeRequest;

  form.addEventListener("submit", event => {
    event.preventDefault();
    const enteredKey = keyInput.value.trim();
    if (!enteredKey || !/^[\x21-\x7e]+$/.test(enteredKey)) {
      keyStatus.textContent = "Gemini API 키를 공백 없이 입력해 주세요.";
      keyInput.focus();
      return;
    }
    resetQuestion();
    key = enteredKey;
    keyInput.value = "";
    clearKey.disabled = false;
    keyStatus.textContent = "이 탭에서 키를 사용할 수 있어요.";
    settings.open = false;
    settings.querySelector("summary").focus();
  });

  clearKey.addEventListener("click", () => {
    key = "";
    keyInput.value = "";
    clearKey.disabled = true;
    resetQuestion();
    keyStatus.textContent = "이 탭에서 키를 지웠어요.";
    keyInput.focus();
  });

  function resetQuestion() {
    activeRequest?.abort();
    activeRequest = undefined;
  }

  function errorMessage(status, payload) {
    const details = payload?.error?.details;
    const invalidKey = Array.isArray(details) && details.some(detail => detail?.reason === "API_KEY_INVALID");
    if (invalidKey || status === 401 || status === 403) {
      return "Gemini API 키와 프로젝트의 Gemini API 권한을 확인해 주세요.";
    }
    if (status === 429) return "Gemini API 사용 한도에 도달했어요. 할당량이나 결제 설정을 확인해 주세요.";
    if (status === 404) return "이 키로 Gemini 3.8 Flash를 사용할 수 없어요. 프로젝트의 모델 접근 권한을 확인해 주세요.";
    if (status >= 500) return "Gemini 서비스가 일시적으로 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.";
    return "Gemini가 요청을 처리하지 못했어요. Google AI Studio에서 키 상태를 확인해 주세요.";
  }

  function buildPrompt(question, selectedAnswer) {
    const detail = question.direction
      ? "두 용어의 짝을 쉽고 짧게 외우는 요령을 하나 제시하세요."
      : "정답을 고르는 핵심 단서를 설명하세요. 선택이 틀렸다면 왜 그 보기가 맞지 않는지도 제공된 자료로 설명할 수 있을 때만 덧붙이세요.";
    return [
      "너는 한국어 해부생리 기말고사 학습 도우미다.",
      detail,
      "아래 자료에 있는 사실과 용어만 사용하세요. 자료에 근거가 없으면 부족하다고 말하세요.",
      "3~5문장을 일반 텍스트로 작성하세요. 교안 원문을 직접 읽었다고 말하지 마세요.",
      "",
      JSON.stringify({
        unit: question.topic,
        question: question.prompt,
        selectedAnswer,
        correctAnswer: question.answer,
        courseExplanation: question.explanation,
      }),
    ].join("\n");
  }

  async function requestExplanation(question, selectedAnswer, control, status, explanation) {
    if (!key) {
      settings.open = true;
      keyInput.focus();
      status.textContent = "Gemini API 키를 입력한 뒤 AI 해설을 다시 눌러 주세요.";
      return;
    }

    const controller = new AbortController();
    activeRequest = controller;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 45000);
    control.disabled = true;
    status.textContent = "Gemini가 해설을 작성하고 있어요.";
    controller.signal.addEventListener("abort", () => {
      status.textContent = timedOut
        ? "Gemini 응답 시간이 초과됐어요. 다시 시도해 주세요."
        : "AI 해설 요청을 취소했어요.";
    }, { once: true });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: buildPrompt(question, selectedAnswer) }] }],
          generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "LOW" } },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (controller.signal.aborted || activeRequest !== controller) return;
      if (!response.ok) {
        status.textContent = errorMessage(response.status, payload);
        return;
      }

      const parts = payload?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts)
        ? parts.filter(part => !part?.thought && typeof part?.text === "string").map(part => part.text).join("\n").trim()
        : "";
      if (!text) {
        status.textContent = "Gemini가 표시할 해설을 반환하지 않았어요. 다시 시도해 주세요.";
        return;
      }

      explanation.textContent = text;
      explanation.hidden = false;
      status.textContent = "Gemini 해설이 준비됐어요.";
      if (document.activeElement === control) explanation.focus();
      control.hidden = true;
    } catch {
      if (!controller.signal.aborted && activeRequest === controller) {
        status.textContent = "Gemini 서버에 연결할 수 없어요. 네트워크를 확인한 뒤 다시 시도해 주세요.";
      }
    } finally {
      clearTimeout(timer);
      if (activeRequest === controller) activeRequest = undefined;
      control.disabled = false;
    }
  }

  function render(question, selectedAnswer) {
    const container = document.createElement("div");
    container.className = "ai-explanation";
    const control = document.createElement("button");
    control.className = "secondary";
    control.type = "button";
    control.textContent = "AI 해설 요청";
    const status = document.createElement("p");
    status.className = "ai-status";
    status.setAttribute("role", "status");
    const explanation = document.createElement("p");
    explanation.className = "ai-response";
    explanation.hidden = true;
    explanation.tabIndex = -1;
    control.addEventListener("click", () => {
      requestExplanation(question, selectedAnswer, control, status, explanation);
    });
    container.append(control, status, explanation);
    return container;
  }

  return { render, resetQuestion };
})();
