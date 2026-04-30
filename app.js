import { createSimuladoApi } from "./simulados.js";

const PAGE_SIZE = 80;
const ASSET_VERSION =
  window.__IFF_ASSET_VERSION__ || document.documentElement.dataset.assetVersion || "dev";
const ACCESS_PASSWORD = "iff2026";
const ACCESS_STORAGE_KEY = "iff_access_granted_v1";

/**
 * @typedef {{ letter: string, text: string }} Alternativa
 * @typedef {{ code: string, description: string, topic: string }} DescritorDetalhe
 * @typedef {{ codes: string[], details: DescritorDetalhe[] }} DescritorQuestao
 * @typedef {{ texto: string, passos?: string[] }} ResolucaoQuestao
 * @typedef {{
 *   id: string,
 *   year: number,
 *   number: number,
 *   discipline: string,
 *   area: string,
 *   statement: string,
 *   statementRaw: string,
 *   textoApoio: string,
 *   fonteReferencia: string[],
 *   alternatives: Alternativa[],
 *   answer: string | null,
 *   descriptor: DescritorQuestao,
 *   descriptors: string[],
 *   descriptorDetails: DescritorDetalhe[],
 *   conteudoResumo: string,
 *   prioridade: string,
 *   imagemApoio: Array<{src: string, page: number, x?: number, y?: number, width?: number, height?: number, alt?: string}>,
 *   images: Array<{src: string, page: number, x?: number, y?: number, width?: number, height?: number, alt?: string}>,
 *   apoioTipos: string[],
 *   resolution: ResolucaoQuestao,
 *   status: string,
 *   manualReview?: { needed: boolean, reasons: string[] },
 *   page?: number | null,
 *   sourcePdf?: string | null,
 *   answerPdf?: string | null,
 *   hasExtractedText?: boolean
 * }} Questao
 */

const state = {
  catalog: null,
  simulados: null,
  access: {
    granted: false,
    bootstrapped: false,
    bootPromise: null,
  },
  simuladoSession: createEmptySimulationSession(),
  studyFocus: createEmptyStudyFocus(),
  view: "questoes",
  limit: PAGE_SIZE,
  selectedPdf: null,
  filters: {
    query: "",
    year: "all",
    discipline: "all",
    priority: "all",
    descriptor: "all",
    answer: "all",
    resolution: "all",
    visual: "all",
  },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const kindLabels = {
  prova: "Prova",
  gabarito: "Gabarito",
  "prova-gabarito": "Prova e gabarito",
  edital: "Edital",
};

const disciplineOrder = [
  "Língua Portuguesa",
  "Matemática",
  "Ciências Naturais",
  "História",
  "Geografia",
];

const simulationTypeLabels = {
  "simulado-rapido": "Simulado rápido (10)",
  "simulado-medio": "Simulado médio (20)",
  "simulado-completo": "Simulado completo (40)",
  "treino-por-disciplina": "Treino por disciplina (10)",
};

const simulationModeLabels = {
  rapido: "Simulado rápido (10)",
  medio: "Simulado médio (20)",
  completo: "Simulado completo (40)",
  treino: "Treino por disciplina (10)",
};

function createEmptySimulationSession() {
  return {
    stage: "setup",
    mode: "",
    label: "",
    discipline: "",
    data: null,
    currentIndex: 0,
    answers: {},
    result: null,
  };
}

function createEmptyStudyFocus() {
  return {
    active: false,
    discipline: "",
    descriptorKey: "",
    contentLabel: "",
    prioritizedQuestionIds: [],
  };
}

function readStoredAccess() {
  try {
    return window.localStorage.getItem(ACCESS_STORAGE_KEY) === "true";
  } catch (_error) {
    return false;
  }
}

function writeStoredAccess(granted) {
  try {
    window.localStorage.setItem(ACCESS_STORAGE_KEY, granted ? "true" : "false");
  } catch (_error) {
    // localStorage may be unavailable; keep the in-memory flow working.
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function questionPool() {
  return state.catalog?.questoesValidas || state.catalog?.questions || [];
}

function simulationPool() {
  return state.catalog?.questoesSimuladoValidas || [];
}

function contentPool() {
  return state.catalog?.conteudosValidos || state.catalog?.contentSummaries || [];
}

function statsPool() {
  return state.catalog?.statsValidos || state.catalog?.stats || {};
}

function questionById(questionId) {
  return questionPool().find((item) => item.id === questionId) || null;
}

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatPercent(value) {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function availableSimulationDisciplines() {
  return disciplineOrder.filter((discipline) =>
    simulationPool().some((question) => question.discipline === discipline),
  );
}

function simulationQuestions() {
  return state.simuladoSession?.data?.questions || [];
}

function simulationCurrentQuestion() {
  const questions = simulationQuestions();
  if (!questions.length) return null;
  const index = Math.min(Math.max(state.simuladoSession.currentIndex, 0), questions.length - 1);
  return questions[index] || null;
}

function simulationSelectedAnswer(questionId) {
  return state.simuladoSession.answers?.[questionId] || "";
}

function simulationAnsweredCount() {
  return simulationQuestions().filter((question) => simulationSelectedAnswer(question.id)).length;
}

function simulationUnansweredCount() {
  return simulationQuestions().length - simulationAnsweredCount();
}

function simulationProgressPercent() {
  const total = simulationQuestions().length;
  if (!total) return 0;
  return Math.round((simulationAnsweredCount() / total) * 100);
}

function simulationCurrentPositionPercent() {
  const total = simulationQuestions().length;
  if (!total) return 0;
  return Math.round(((state.simuladoSession.currentIndex + 1) / total) * 100);
}

function simulationNextUnansweredIndex() {
  return simulationQuestions().findIndex(
    (question, index) =>
      index > state.simuladoSession.currentIndex && !simulationSelectedAnswer(question.id),
  );
}

function simulationQuestionOutcome(question) {
  const selected = simulationSelectedAnswer(question.id);
  const correct = String(question.answer || "");
  const hit = Boolean(selected && correct && selected === correct);
  if (!selected) {
    return { selected: "", correct, hit: false, state: "blank" };
  }
  return {
    selected,
    correct,
    hit,
    state: hit ? "correct" : "wrong",
  };
}

function questionSort(a, b) {
  return b.year - a.year || a.number - b.number;
}

function normalizeResolution(resolution) {
  const raw = resolution && typeof resolution === "object" ? resolution : {};
  const texto = String(raw.texto || raw.text || "").trim();
  const passos = Array.isArray(raw.passos || raw.steps)
    ? (raw.passos || raw.steps).map((item) => String(item).trim()).filter(Boolean)
    : [];
  const normalized = { texto };
  if (passos.length) normalized.passos = passos;
  return normalized;
}

function normalizeContentSummary(value, discipline = "") {
  const raw = String(value || "").trim();
  if (raw) return raw;
  if (discipline === "Língua Portuguesa") return "Interpretação de texto";
  if (discipline === "Matemática") return "Resolução de problemas";
  if (discipline === "Ciências Naturais") return "Ciências da natureza";
  if (discipline === "História") return "Contexto histórico";
  if (discipline === "Geografia") return "Espaço geográfico";
  return "Assunto em revisão";
}

function contentKey(discipline, label) {
  return `${discipline}::${label}`;
}

function setAccessError(message = "") {
  const errorNode = $("#accessError");
  if (!errorNode) return;
  errorNode.textContent = message;
  errorNode.hidden = !message;
}

function setAccessLoading(loading) {
  const submit = $("#accessSubmit");
  const input = $("#accessPasswordInput");
  if (submit) {
    submit.disabled = loading;
    submit.textContent = loading ? "Liberando..." : "Entrar";
  }
  if (input) input.disabled = loading;
}

function applyAccessState(granted) {
  state.access.granted = granted;
  document.body.classList.toggle("access-locked", !granted);
  const gate = $("#accessGate");
  const appShell = $("#appShell");
  if (gate) gate.hidden = granted;
  if (appShell) {
    if (granted) appShell.removeAttribute("aria-hidden");
    else appShell.setAttribute("aria-hidden", "true");
  }
  if (!granted) {
    window.setTimeout(() => $("#accessPasswordInput")?.focus(), 40);
  }
}

function buildContentPool(questions) {
  const groups = new Map();

  questions.forEach((question) => {
    const label = normalizeContentSummary(question.conteudoResumo, question.discipline);
    const key = contentKey(question.discipline, label);
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label,
        discipline: question.discipline,
        count: 0,
        questions: [],
      });
    }
    const entry = groups.get(key);
    entry.count += 1;
    entry.questions.push(question.id);
  });

  return [...groups.values()].sort((a, b) => {
    const disciplineDiff =
      disciplineOrder.indexOf(a.discipline) - disciplineOrder.indexOf(b.discipline);
    return disciplineDiff || b.count - a.count || a.label.localeCompare(b.label, "pt-BR");
  });
}

function hasResolutionContent(resolution) {
  return Boolean((resolution?.texto || "").trim() || resolution?.passos?.length);
}

function inferQuestionStatus(question) {
  if (!question.answer) return "sem_gabarito";
  if (!hasResolutionContent(question.resolution)) return "sem_resolucao";
  if (!question.statement || !question.alternatives.length || !question.descriptors.length) {
    return "revisar";
  }
  return "completa";
}

function normalizeQuestion(rawQuestion) {
  const descriptorDetails = Array.isArray(rawQuestion.descriptorDetails)
    ? rawQuestion.descriptorDetails.map((item) => ({
        code: String(item?.code || ""),
        description: String(item?.description || ""),
        topic: String(item?.topic || ""),
      }))
    : [];
  const descriptors = Array.isArray(rawQuestion.descriptors)
    ? rawQuestion.descriptors.map((item) => String(item))
    : [];
  const descriptor =
    rawQuestion.descriptor && typeof rawQuestion.descriptor === "object"
      ? {
          codes: Array.isArray(rawQuestion.descriptor.codes)
            ? rawQuestion.descriptor.codes.map((item) => String(item))
            : descriptors,
          details: Array.isArray(rawQuestion.descriptor.details)
            ? rawQuestion.descriptor.details.map((item) => ({
                code: String(item?.code || ""),
                description: String(item?.description || ""),
                topic: String(item?.topic || ""),
              }))
            : descriptorDetails,
        }
      : { codes: descriptors, details: descriptorDetails };

  const normalized = {
    id: String(rawQuestion.id || ""),
    year: Number(rawQuestion.year || 0),
    number: Number(rawQuestion.number || 0),
    discipline: String(rawQuestion.discipline || ""),
    area: String(rawQuestion.area || ""),
    statement: String(rawQuestion.statement || "").trim(),
    statementRaw: String(rawQuestion.statementRaw || rawQuestion.statement || "").trim(),
    textoApoio: String(rawQuestion.textoApoio || "").trim(),
    fonteReferencia: Array.isArray(rawQuestion.fonteReferencia)
      ? rawQuestion.fonteReferencia.map((item) => String(item).trim()).filter(Boolean)
      : [],
    alternatives: Array.isArray(rawQuestion.alternatives)
      ? rawQuestion.alternatives
          .map((item) => ({
            letter: String(item?.letter || "").toUpperCase(),
            text: String(item?.text || "").trim(),
          }))
          .filter((item) => item.letter && item.text)
      : [],
    answer: rawQuestion.answer ? String(rawQuestion.answer) : null,
    descriptor,
    descriptors: descriptor.codes,
    descriptorDetails: descriptor.details,
    conteudoResumo: normalizeContentSummary(
      rawQuestion.conteudoResumo,
      String(rawQuestion.discipline || ""),
    ),
    prioridade: String(rawQuestion.prioridade || "media").trim().toLowerCase() || "media",
    imagemApoio: Array.isArray(rawQuestion.imagemApoio) ? rawQuestion.imagemApoio : [],
    images: Array.isArray(rawQuestion.images) ? rawQuestion.images : [],
    apoioTipos: Array.isArray(rawQuestion.apoioTipos)
      ? rawQuestion.apoioTipos.map((item) => String(item).trim()).filter(Boolean)
      : [],
    resolution: normalizeResolution(rawQuestion.resolution),
    status: String(rawQuestion.status || ""),
    manualReview:
      rawQuestion.manualReview && typeof rawQuestion.manualReview === "object"
        ? {
            needed: Boolean(rawQuestion.manualReview.needed),
            reasons: Array.isArray(rawQuestion.manualReview.reasons)
              ? rawQuestion.manualReview.reasons.map((item) => String(item))
              : [],
          }
        : { needed: false, reasons: [] },
    elegivelSimulado:
      typeof rawQuestion.elegivelSimulado === "boolean"
        ? rawQuestion.elegivelSimulado
        : String(rawQuestion.status || "").trim() === "completa",
    motivosInelegibilidadeSimulado: Array.isArray(rawQuestion.motivosInelegibilidadeSimulado)
      ? rawQuestion.motivosInelegibilidadeSimulado.map((item) => String(item).trim()).filter(Boolean)
      : [],
    page: rawQuestion.page ?? null,
    sourcePdf: rawQuestion.sourcePdf || null,
    answerPdf: rawQuestion.answerPdf || null,
    hasExtractedText: Boolean(rawQuestion.hasExtractedText),
  };

  normalized.status = normalized.status || inferQuestionStatus(normalized);
  return normalized;
}

function hasResolution(question) {
  return hasResolutionContent(question.resolution);
}

function getResolution(questionId) {
  return questionById(questionId)?.resolution || null;
}

function contentSummary(question) {
  return normalizeContentSummary(question.conteudoResumo, question.discipline);
}

function contentSummaryText(question) {
  return contentSummary(question) || "Sem classificação";
}

function contentFilterChip(question) {
  const label = contentSummary(question);
  if (!label) {
    return '<p class="question-support is-missing">Assunto não identificado nesta questão.</p>';
  }
  return `
    <div class="descriptor-chips">
      <button class="descriptor-chip" type="button" data-set-descriptor="${escapeHtml(
        contentKey(question.discipline, label),
      )}">${escapeHtml(label)}</button>
    </div>
  `;
}

function hasQuestionImages(question) {
  return Boolean(questionSupportImages(question).length);
}

function needsPdfConsult(question) {
  return !question.hasExtractedText;
}

function questionMatches(question) {
  const { query, year, discipline, priority, descriptor, answer, resolution, visual } =
    state.filters;
  if (year !== "all" && String(question.year) !== year) return false;
  if (discipline !== "all" && question.discipline !== discipline) return false;
  if (priority !== "all" && question.prioridade !== priority) return false;
  if (descriptor !== "all") {
    if (contentKey(question.discipline, contentSummary(question)) !== descriptor) return false;
  }
  if (answer === "missing" && question.answer) return false;
  if (!["all", "missing"].includes(answer) && question.answer !== answer) return false;
  if (resolution === "done" && !hasResolution(question)) return false;
  if (resolution === "todo" && hasResolution(question)) return false;
  if (visual === "with-images" && !hasQuestionImages(question)) return false;
  if (visual === "without-images" && hasQuestionImages(question)) return false;
  if (visual === "pdf-needed" && !needsPdfConsult(question)) return false;
  if (query.trim()) {
    const haystack = normalize(
      [
        question.id,
        question.year,
        question.number,
        question.discipline,
        question.area,
        question.statement,
        question.statementRaw,
        question.textoApoio || "",
        (question.fonteReferencia || []).join(" "),
        question.alternatives.map((item) => `${item.letter}) ${item.text}`).join(" "),
        question.prioridade,
        question.answer,
        contentSummary(question),
        question.resolution?.texto || "",
      ].join(" "),
    );
    if (!haystack.includes(normalize(query.trim()))) return false;
  }
  return true;
}

function filteredQuestions() {
  const questions = questionPool().filter(questionMatches).sort(questionSort);
  const focus = state.studyFocus;
  if (
    !focus?.active ||
    focus.descriptorKey !== state.filters.descriptor ||
    focus.discipline !== state.filters.discipline
  ) {
    return questions;
  }

  const rankMap = new Map(
    (focus.prioritizedQuestionIds || []).map((questionId, index) => [questionId, index]),
  );
  return [...questions].sort((a, b) => {
    const aRank = rankMap.has(a.id) ? rankMap.get(a.id) : Number.POSITIVE_INFINITY;
    const bRank = rankMap.has(b.id) ? rankMap.get(b.id) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return questionSort(a, b);
  });
}

function setView(view) {
  state.view = view;
  $$(".tab").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
  });
  $$(".view").forEach((section) => {
    section.classList.toggle("is-active", section.id === `view-${view}`);
  });
  const workspace = $(".workspace");
  if (workspace) workspace.dataset.activeView = view;
  history.replaceState(null, "", `#${view}`);
  renderCurrentView();
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("is-visible");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => node.classList.remove("is-visible"), 2400);
}

function populateFilters() {
  const years = [...(statsPool().years || [])].sort((a, b) => b - a);
  $("#yearFilter").innerHTML = [
    '<option value="all">Todos</option>',
    ...years.map((year) => `<option value="${year}">${year}</option>`),
  ].join("");

  const disciplines = disciplineOrder.filter((discipline) =>
    questionPool().some((question) => question.discipline === discipline),
  );
  $("#disciplineFilter").innerHTML = [
    '<option value="all">Todas</option>',
    ...disciplines.map(
      (discipline) => `<option value="${escapeHtml(discipline)}">${escapeHtml(discipline)}</option>`,
    ),
  ].join("");

  const descriptors = [...contentPool()].sort((a, b) => {
    const disciplineDiff =
      disciplineOrder.indexOf(a.discipline) - disciplineOrder.indexOf(b.discipline);
    return disciplineDiff || a.label.localeCompare(b.label, "pt-BR");
  });
  $("#descriptorFilter").innerHTML = [
    '<option value="all">Todos</option>',
    ...disciplineOrder
      .map((discipline) => {
        const items = descriptors.filter((item) => item.discipline === discipline);
        if (!items.length) return "";
        return `
          <optgroup label="${escapeHtml(discipline)}">
            ${items
              .map((item) => {
                const key = contentKey(item.discipline, item.label);
                return `<option value="${escapeHtml(key)}">${escapeHtml(item.label)}</option>`;
              })
              .join("")}
          </optgroup>
        `;
      })
      .filter(Boolean),
  ].join("");
}

function updateStats() {
  const stats = statsPool();
  $("#statQuestions").textContent = stats.questions;
  $("#statAnswers").textContent = stats.questionsWithAnswers;
  $("#statDescriptors").textContent =
    stats.questionsWithContentSummary || stats.questionsWithDescriptors;
  $("#statYears").textContent = stats.years.length;
  $("#statImages").textContent = stats.questionImages || 0;

  const top = [...contentPool()].sort((a, b) => b.count - a.count).slice(0, 2);
  $("#focusStrip").innerHTML = top.length
    ? `
      <strong>Assuntos que mais aparecem</strong>
      ${top.map((item) => `<span>${escapeHtml(item.discipline)}: ${escapeHtml(item.label)}</span>`).join("")}
    `
    : "<strong>Tudo pronto</strong><span>Use os filtros para estudar por assunto.</span>";
}

function answerPill(question) {
  if (!question.answer) return '<span class="pill is-missing">Sem gabarito</span>';
  const text = question.answer === "ANULADA" ? "Anulada" : `Gabarito ${question.answer}`;
  return `<span class="pill is-answer">${escapeHtml(text)}</span>`;
}

function statusLabel(status) {
  if (status === "completa") return "Completa";
  if (status === "sem_resolucao") return "Sem resolução";
  if (status === "sem_gabarito") return "Sem gabarito";
  return "Revisar";
}

function statusPill(question) {
  return `<span class="pill is-status-${escapeHtml(question.status)}">${escapeHtml(
    statusLabel(question.status),
  )}</span>`;
}

function priorityLabel(priority) {
  if (priority === "alta") return "🔴 Alta";
  if (priority === "baixa") return "⚪ Baixa";
  return "🟡 Média";
}

function priorityPill(question) {
  const priority = ["alta", "media", "baixa"].includes(question.prioridade)
    ? question.prioridade
    : "media";
  return `<span class="pill is-priority-${escapeHtml(priority)}">${escapeHtml(
    priorityLabel(priority),
  )}</span>`;
}

function studyFocusPill(question) {
  const focus = state.studyFocus;
  if (!focus?.active) return "";
  if (!(focus.prioritizedQuestionIds || []).includes(question.id)) return "";
  return '<span class="pill is-study-focus">Foco do seu simulado</span>';
}

function contextPills(question) {
  const pills = [];
  if (hasQuestionImages(question)) {
    pills.push('<span class="pill is-visual">Visual do PDF</span>');
  }
  if (needsPdfConsult(question)) {
    pills.push('<span class="pill is-pdf">Confira no PDF</span>');
  }
  return pills.join("");
}

function descriptorChips(question) {
  return contentFilterChip(question);
}

function alternativesMarkup(question) {
  if (!question.alternatives?.length) {
    return '<p class="question-support is-missing">Alternativas não estruturadas automaticamente. Consulte o PDF da prova.</p>';
  }
  return `
    <ol class="alternatives-list">
      ${question.alternatives
        .map(
          (alternative) => `
            <li class="alternative-item">
              <span class="alternative-letter">${escapeHtml(alternative.letter)}</span>
              <span class="alternative-text">${escapeHtml(alternative.text)}</span>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

function descriptorSummary(question) {
  return contentSummaryText(question);
}

function questionSupportText(question) {
  return String(question.textoApoio || "").trim();
}

function questionSupportImages(question) {
  return question.imagemApoio?.length ? question.imagemApoio : question.images || [];
}

function supportTextMarkup(question) {
  const text = questionSupportText(question);
  if (!text) return "";
  return `
    <section class="support-block">
      <strong class="support-title">Texto de apoio</strong>
      <pre class="support-text">${escapeHtml(text)}</pre>
    </section>
  `;
}

function questionImages(question) {
  const images = questionSupportImages(question);
  if (!images.length) return "";
  return `
    <div class="question-images">
      ${images
        .map(
          (image, index) => `
            <figure class="question-image">
              <a href="${escapeHtml(image.src)}" target="_blank" rel="noreferrer">
                <img src="${escapeHtml(image.src)}" alt="${escapeHtml(
                  image.alt || `Figura da questão ${question.number}`,
                )}" loading="lazy" />
              </a>
              <figcaption>Elemento visual ${index + 1} · página ${escapeHtml(image.page)}</figcaption>
            </figure>
          `,
        )
        .join("")}
    </div>
  `;
}

function referenceMarkup(question) {
  if (!question.fonteReferencia?.length) return "";
  return `
    <section class="reference-block">
      <strong class="support-title">Fonte / referência</strong>
      <div class="reference-list">
        ${question.fonteReferencia
          .map((item) => `<p class="reference-item">${escapeHtml(item)}</p>`)
          .join("")}
      </div>
    </section>
  `;
}

function resolutionMarkup(question) {
  const resolution = getResolution(question.id);
  const summary = hasResolution(question) ? "Ver resolução" : "Sem resolução";

  let published = "";
  if (resolution?.passos?.length) {
    published += `<ol>${resolution.passos.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`;
  }
  if (resolution?.texto) {
    published += `<p class="resolution-text">${escapeHtml(resolution.texto)}</p>`;
  }
  if (question.answer) {
    published = `<p class="resolution-text"><strong>Resposta:</strong> ${escapeHtml(
      question.answer,
    )}</p>${published}`;
  }

  return `
    <details class="resolution-panel">
      <summary>${summary}</summary>
      <div class="resolution-content">
        ${published || '<p class="resolution-text">Sem comentário publicado para esta questão.</p>'}
      </div>
    </details>
  `;
}

function questionCard(question) {
  const pdfPage = question.page ? `#page=${question.page}` : "";
  const pdfLink = question.sourcePdf ? `${question.sourcePdf}${pdfPage}` : "";
  const isStudyFocusQuestion = Boolean(
    state.studyFocus?.active && (state.studyFocus.prioritizedQuestionIds || []).includes(question.id),
  );
  return `
    <article class="question-card${isStudyFocusQuestion ? " is-study-focus" : ""}" data-question-id="${question.id}">
      <div class="question-top">
        <span class="pill">${question.year}</span>
        <span class="pill">Questão ${String(question.number).padStart(2, "0")}</span>
        <span class="pill is-discipline">${escapeHtml(question.discipline)}</span>
        ${studyFocusPill(question)}
        ${priorityPill(question)}
        ${answerPill(question)}
        ${statusPill(question)}
        ${contextPills(question)}
      </div>
      <h2 class="question-title">${escapeHtml(question.area)}</h2>
      ${supportTextMarkup(question)}
      ${questionImages(question)}
      ${referenceMarkup(question)}
      ${
        question.statement
          ? `<pre class="statement">${escapeHtml(question.statement)}</pre>`
          : '<p class="empty-statement">Texto não extraído automaticamente. Abra o PDF da prova para consultar o enunciado.</p>'
      }
      ${alternativesMarkup(question)}
      <div class="question-support-grid">
        <div class="question-support-card">
          <strong>Gabarito</strong>
          <span>${escapeHtml(question.answer || "Sem gabarito oficial")}</span>
        </div>
        <div class="question-support-card">
          <strong>Assunto</strong>
          <span>${escapeHtml(contentSummaryText(question))}</span>
        </div>
      </div>
      ${contentFilterChip(question)}
      <div class="card-actions">
        ${
          question.sourcePdf
            ? `<button class="mini-button is-light" type="button" data-open-pdf="${escapeHtml(
                question.sourcePdf,
              )}" data-pdf-title="${question.year} questão ${question.number}" data-pdf-page="${
                question.page || ""
              }">
                <svg><use href="#icon-file"></use></svg>
                <span>Ver no PDF</span>
              </button>
              <a class="mini-button is-light" href="${escapeHtml(pdfLink)}" target="_blank" rel="noreferrer">
                <svg><use href="#icon-open"></use></svg>
                <span>Abrir arquivo</span>
              </a>`
            : ""
        }
      </div>
      ${resolutionMarkup(question)}
    </article>
  `;
}

function renderQuestions() {
  const all = filteredQuestions();
  const visible = all.slice(0, state.limit);
  const focus = state.studyFocus;
  const prioritizedCount = focus?.active ? (focus.prioritizedQuestionIds || []).length : 0;
  const banner = $("#studyNowBanner");
  $("#resultCount").textContent = `${countLabel(all.length, "questão", "questões")} encontrada${
    all.length === 1 ? "" : "s"
  }`;
  if (banner) {
    banner.innerHTML =
      focus?.active && focus.contentLabel
        ? `
          <strong>Estude agora: ${escapeHtml(focus.contentLabel)}</strong>
          <span>${
            prioritizedCount
              ? `As primeiras ${countLabel(
                  prioritizedCount,
                  "questão",
                  "questões",
                )} são as que você errou ou deixou em branco no último simulado desse assunto.`
              : "Aqui estão as questões desse assunto para você continuar estudando."
          }</span>
        `
        : "";
    banner.hidden = !(focus?.active && focus.contentLabel);
  }
  $("#questionList").innerHTML = visible.length
    ? visible.map(questionCard).join("")
    : '<div class="empty-state">Nenhuma questão encontrada com os filtros atuais.</div>';
  $("#moreButton").style.display = all.length > visible.length ? "inline-flex" : "none";
}

function sourceCard(source) {
  const selected = state.selectedPdf?.pdf === source.pdf ? " is-selected" : "";
  return `
    <article class="source-card${selected}">
      <strong>${escapeHtml(source.title)}</strong>
      <div class="source-meta">
        <span class="pill">${source.year || "Geral"}</span>
        <span class="pill">${escapeHtml(kindLabels[source.kind] || source.kind)}</span>
        <span class="pill">${source.pages} página${source.pages === 1 ? "" : "s"}</span>
      </div>
      <div class="card-actions">
        <button class="mini-button" type="button" data-open-source="${escapeHtml(source.pdf)}" data-source-title="${escapeHtml(
          source.title,
        )}">
          <svg><use href="#icon-file"></use></svg>
          <span>Visualizar</span>
        </button>
        <a class="mini-button is-light" href="${escapeHtml(source.pdf)}" target="_blank" rel="noreferrer">
          <svg><use href="#icon-open"></use></svg>
          <span>Abrir</span>
        </a>
      </div>
    </article>
  `;
}

function renderSources() {
  const year = state.filters.year;
  const sources = state.catalog.sources
    .filter((source) => year === "all" || String(source.year) === year || source.kind === "edital")
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.kind.localeCompare(b.kind));
  $("#sourceCount").textContent = `${sources.length} arquivo${sources.length === 1 ? "" : "s"} local${
    sources.length === 1 ? "" : "is"
  }`;
  $("#sourceList").innerHTML = sources.map(sourceCard).join("");
  if (!state.selectedPdf && sources.length) {
    openPdf(sources.find((source) => source.kind === "prova") || sources[0], false);
  }
}

function descriptorMatches(item) {
  const { query, discipline, descriptor } = state.filters;
  if (discipline !== "all" && item.discipline !== discipline) return false;
  if (descriptor !== "all" && item.id !== descriptor) return false;
  if (query.trim()) {
    const haystack = normalize([item.label, item.discipline].join(" "));
    if (!haystack.includes(normalize(query.trim()))) return false;
  }
  return true;
}

function descriptorSearchMatches(item) {
  const { query } = state.filters;
  if (query.trim()) {
    const haystack = normalize([item.label, item.discipline].join(" "));
    if (!haystack.includes(normalize(query.trim()))) return false;
  }
  return true;
}

function descriptorQuestionItems(item) {
  return (item.questions || []).map(questionById).filter(Boolean);
}

function descriptorResolutionCount(item) {
  return descriptorQuestionItems(item).filter(hasResolution).length;
}

function descriptorYearSummary(item) {
  const years = unique(descriptorQuestionItems(item).map((question) => question.year)).sort(
    (a, b) => a - b,
  );
  if (!years.length) return "";
  return years[0] === years[years.length - 1]
    ? String(years[0])
    : `${years[0]}-${years[years.length - 1]}`;
}

function descriptorLatestYear(item) {
  const years = descriptorQuestionItems(item).map((question) => question.year);
  return years.length ? Math.max(...years) : 0;
}

function descriptorPriorityStats(item) {
  const resolved = descriptorResolutionCount(item);
  const pending = Math.max(item.count - resolved, 0);
  const latestYear = descriptorLatestYear(item);
  const recentBonus = latestYear >= 2025 ? 3 : latestYear >= 2023 ? 2 : latestYear >= 2019 ? 1 : 0;
  const score = pending * 5 + item.count * 3 + recentBonus - (resolved === item.count ? 6 : 0);

  let level = "base";
  let label = "Manter no radar";
  if (resolved === item.count && item.count > 0) {
    level = "done";
    label = "Revisado";
  } else if (score >= 26 || (pending >= 3 && item.count >= 4)) {
    level = "high";
    label = "Alta prioridade";
  } else if (score >= 16 || pending >= 2) {
    level = "medium";
    label = "Boa aposta";
  }

  return { resolved, pending, latestYear, score, level, label };
}

function sortDescriptorsByPriority(items) {
  return [...items].sort((a, b) => {
    const aStats = descriptorPriorityStats(a);
    const bStats = descriptorPriorityStats(b);
    return (
      bStats.score - aStats.score ||
      bStats.pending - aStats.pending ||
      b.count - a.count ||
      bStats.latestYear - aStats.latestYear ||
      a.label.localeCompare(b.label, "pt-BR")
    );
  });
}

function descriptorCard(item, showDiscipline = false) {
  const { resolved, pending, latestYear, level, label } = descriptorPriorityStats(item);
  const yearSummary = descriptorYearSummary(item);
  const disciplineText = showDiscipline ? "" : `<p>${escapeHtml(item.discipline)}</p>`;
  const summaryText =
    item.count === 1
      ? "Assunto encontrado em 1 questão válida."
      : `Assunto encontrado em ${item.count} questões válidas.`;
  return `
    <article class="descriptor-card">
      <header>
        <h2>${showDiscipline ? `${escapeHtml(item.discipline)} · ` : ""}${escapeHtml(item.label)}</h2>
        <div class="descriptor-meta">
          <span class="pill is-answer">${countLabel(item.count, "questão", "questões")}</span>
          <span class="pill is-progress">${resolved}/${item.count} com resolução</span>
          <span class="pill is-priority-${level}">${escapeHtml(label)}</span>
          ${yearSummary ? `<span class="pill">${escapeHtml(yearSummary)}</span>` : ""}
        </div>
      </header>
      ${disciplineText}
      <p>${escapeHtml(summaryText)}</p>
      <p class="descriptor-summary">${countLabel(pending, "pendência", "pendências")} · última incidência em ${escapeHtml(latestYear || "-")}</p>
      <div class="card-actions">
        <button class="mini-button is-light" type="button" data-descriptor-filter="${escapeHtml(item.id)}">
          <svg><use href="#icon-list"></use></svg>
          <span>Ver questões</span>
        </button>
      </div>
    </article>
  `;
}

function renderDescriptorToolbar(descriptors) {
  const toolbarPool = contentPool().filter(descriptorSearchMatches);
  const countsByDiscipline = disciplineOrder
    .map((discipline) => ({
      discipline,
      count: toolbarPool.filter((item) => item.discipline === discipline).length,
    }))
    .filter((item) => item.count > 0);

  const shortcutPool =
    state.filters.discipline === "all"
      ? descriptors
      : descriptors.filter((item) => item.discipline === state.filters.discipline);
  const shortcuts = sortDescriptorsByPriority(shortcutPool)
    .slice(0, 8);
  const selectedLabel =
    state.filters.discipline === "all" ? "Todas as disciplinas" : state.filters.discipline;

  $("#descriptorToolbar").innerHTML = `
    <div class="descriptor-rail" aria-label="Disciplinas">
      <button
        class="discipline-filter${state.filters.discipline === "all" ? " is-active" : ""}"
        type="button"
        data-discipline-filter="all"
      >
        <span>Todas</span>
        <small>${toolbarPool.length}</small>
      </button>
      ${countsByDiscipline
        .map(
          (item) => `
            <button
              class="discipline-filter${state.filters.discipline === item.discipline ? " is-active" : ""}"
              type="button"
              data-discipline-filter="${escapeHtml(item.discipline)}"
            >
              <span>${escapeHtml(item.discipline)}</span>
              <small>${item.count}</small>
            </button>
          `,
        )
        .join("")}
    </div>
    ${
      shortcuts.length
        ? `
          <div class="descriptor-shortcuts">
            <strong>Vale revisar agora · ${escapeHtml(selectedLabel)}</strong>
            <div class="descriptor-shortcut-list">
              ${shortcuts
                .map(
                  (item) => {
                    const stats = descriptorPriorityStats(item);
                    return `
                    <button
                      class="descriptor-shortcut"
                      type="button"
                      data-descriptor-filter="${escapeHtml(item.id)}"
                      title="${escapeHtml(stats.label)}"
                    >
                      <span>${escapeHtml(item.label)}</span>
                      <small>${stats.pending} pend.</small>
                    </button>
                  `;
                  },
                )
                .join("")}
            </div>
          </div>
        `
        : ""
    }
  `;
}

function renderDescriptors() {
  const descriptors = sortDescriptorsByPriority(contentPool().filter(descriptorMatches));
  const selectedLabel =
    state.filters.discipline === "all" ? "" : ` em ${state.filters.discipline}`;
  $("#descriptorCount").textContent = `${descriptors.length} assunto${
    descriptors.length === 1 ? "" : "s"
  }${selectedLabel} · veja o que mais vale revisar`;
  renderDescriptorToolbar(descriptors);

  if (!descriptors.length) {
    $("#descriptorList").innerHTML =
      '<div class="empty-state">Nenhum assunto encontrado com os filtros atuais.</div>';
    return;
  }

  if (state.filters.discipline !== "all" || state.filters.descriptor !== "all") {
    $("#descriptorList").innerHTML = descriptors.map((item) => descriptorCard(item)).join("");
    return;
  }

  const groups = disciplineOrder
    .map((discipline) => ({
      discipline,
      items: sortDescriptorsByPriority(descriptors.filter((item) => item.discipline === discipline)),
    }))
    .filter((group) => group.items.length);

  $("#descriptorList").innerHTML = groups
    .map((group) => {
      const totalQuestions = group.items.reduce((sum, item) => sum + item.count, 0);
      return `
        <section class="descriptor-group">
          <header class="descriptor-group-head">
            <div>
              <h2>${escapeHtml(group.discipline)}</h2>
              <p>${group.items.length} assunto${
                group.items.length === 1 ? "" : "s"
              } · ${totalQuestions} incidência${totalQuestions === 1 ? "" : "s"}</p>
            </div>
            <button
              class="mini-button is-light"
              type="button"
              data-discipline-filter="${escapeHtml(group.discipline)}"
            >
              <svg><use href="#icon-tag"></use></svg>
              <span>Focar disciplina</span>
            </button>
          </header>
          <div class="descriptor-grid">
            ${group.items.map((item) => descriptorCard(item)).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderResolutions() {
  const questions = questionPool()
    .filter((question) => hasResolution(question) && questionMatches(question))
    .sort(questionSort);
  $("#resolutionCount").textContent = countLabel(questions.length, "resolução", "resoluções");
  $("#resolutionBoard").innerHTML = questions.length
    ? questions
        .map((question) => {
          const resolution = getResolution(question.id);
          const preview = resolution?.passos?.join(" ") || resolution?.texto || "";
          return `
            <article class="resolution-card">
              <header>
                <h2>${question.year} · Questão ${String(question.number).padStart(2, "0")}</h2>
                <span class="pill is-discipline">${escapeHtml(question.discipline)}</span>
              </header>
              <p>${escapeHtml(resolution?.title || "Resolução comentada")}</p>
              <p>${escapeHtml(preview).slice(0, 260)}${preview.length > 260 ? "..." : ""}</p>
              <button class="mini-button is-light" type="button" data-jump-question="${question.id}">
                <svg><use href="#icon-list"></use></svg>
                <span>Ver questão</span>
              </button>
            </article>
          `;
        })
        .join("")
    : '<div class="empty-state">Nenhuma resolução salva para os filtros atuais.</div>';
}

function simulationLabel(session) {
  if (session?.label) return session.label;
  if (session?.data?.type) return simulationTypeLabels[session.data.type] || "Simulado";
  return "Simulado";
}

function simulationCountText(text) {
  const node = $("#simulationCount");
  if (node) node.textContent = text;
}

function simulationQuestionButton(question, index) {
  const isActive = index === state.simuladoSession.currentIndex;
  const isAnswered = Boolean(simulationSelectedAnswer(question.id));
  const outcome = simulationQuestionOutcome(question);
  const resultClass =
    state.simuladoSession.stage === "review"
      ? ` is-${outcome.state}`
      : "";
  return `
    <button
      class="simulation-step${isActive ? " is-active" : ""}${isAnswered ? " is-answered" : ""}${resultClass}"
      type="button"
      data-sim-question="${index}"
      aria-current="${isActive ? "step" : "false"}"
    >
      ${index + 1}
    </button>
  `;
}

function simulationAlternativeMarkup(question, alternative) {
  const selected = simulationSelectedAnswer(question.id) === alternative.letter;
  const isReview = state.simuladoSession.stage === "review";
  const isCorrect = question.answer === alternative.letter;
  const isWrongSelected = isReview && selected && !isCorrect;
  const reviewClass = isReview
    ? `${isCorrect ? " is-correct" : ""}${isWrongSelected ? " is-wrong" : ""}`
    : "";
  return `
    <button
      class="simulation-alternative${selected ? " is-selected" : ""}${reviewClass}"
      type="button"
      data-sim-answer="${escapeHtml(alternative.letter)}"
      data-question-id="${escapeHtml(question.id)}"
      aria-pressed="${selected ? "true" : "false"}"
      ${isReview ? "disabled" : ""}
    >
      <span class="alternative-letter">${escapeHtml(alternative.letter)}</span>
      <span class="alternative-text">${escapeHtml(alternative.text)}</span>
    </button>
  `;
}

function simulationSetupMarkup() {
  const disciplines = availableSimulationDisciplines();
  const disciplineOptions = disciplines
    .map(
      (discipline) =>
        `<option value="${escapeHtml(discipline)}">${escapeHtml(discipline)}</option>`,
    )
    .join("");

  simulationCountText("Escolha um formato e treine no estilo da prova do IFF.");

  return `
    <div class="simulation-shell">
      <section class="simulation-launch-grid" aria-label="Formatos de simulado">
        <article class="simulation-launch-card">
          <div>
            <h2>Simulado rápido · 10 questões</h2>
            <p>10 questões com distribuição equilibrada entre as disciplinas.</p>
          </div>
          <small>2 Português · 2 Matemática · 2 Ciências Naturais · 2 História · 2 Geografia</small>
          <button class="tool-button" type="button" data-sim-start="rapido">Iniciar</button>
        </article>

        <article class="simulation-launch-card">
          <div>
            <h2>Simulado médio · 20 questões</h2>
            <p>20 questões no estilo mais comum da prova do IFF.</p>
          </div>
          <small>5 Português · 5 Matemática · 5 Ciências Naturais · História e Geografia alternadas</small>
          <button class="tool-button" type="button" data-sim-start="medio">Iniciar</button>
        </article>

        <article class="simulation-launch-card">
          <div>
            <h2>Simulado completo · 40 questões</h2>
            <p>40 questões no formato mais próximo da prova completa.</p>
          </div>
          <small>10 Português · 10 Matemática · 10 Ciências Naturais · 5 História · 5 Geografia</small>
          <button class="tool-button" type="button" data-sim-start="completo">Iniciar</button>
        </article>

        <article class="simulation-launch-card">
          <div>
            <h2>Treino por disciplina · 10 questões</h2>
            <p>10 questões da disciplina escolhida, misturando assuntos que mais caem e pontos de revisão.</p>
          </div>
          <label class="control">
            <span>Disciplina</span>
            <select id="simulationDisciplineSelect">${disciplineOptions}</select>
          </label>
          <button class="tool-button" type="button" data-sim-start="treino">Iniciar treino</button>
        </article>
      </section>
    </div>
  `;
}

function simulationReviewSummary(question) {
  const outcome = simulationQuestionOutcome(question);
  const statusLabel =
    outcome.state === "correct"
      ? "Acertou"
      : outcome.state === "wrong"
        ? "Errou"
        : "Em branco";
  const statusClass =
    outcome.state === "correct"
      ? "is-answer"
      : outcome.state === "wrong"
        ? "is-status-sem_gabarito"
        : "is-missing";

  return `
    <div class="simulation-review-meta">
      <span class="pill ${statusClass}">${escapeHtml(statusLabel)}</span>
      <span class="pill">Sua resposta: ${escapeHtml(outcome.selected || "—")}</span>
      <span class="pill is-answer">Resposta correta: ${escapeHtml(outcome.correct || "—")}</span>
      <span class="pill is-discipline">${escapeHtml(contentSummaryText(question))}</span>
    </div>
  `;
}

function simulationReviewListMarkup() {
  const questions = simulationQuestions();
  if (!questions.length) return "";

  return `
    <section class="simulation-results-card">
      <header>
        <h2>Revisão por questão</h2>
      </header>
      <div class="simulation-review-list">
        ${questions
          .map((question, index) => {
            const outcome = simulationQuestionOutcome(question);
            const statusLabel =
              outcome.state === "correct"
                ? "Acertou"
                : outcome.state === "wrong"
                  ? "Errou"
                  : "Em branco";
            const statusClass =
              outcome.state === "correct"
                ? "is-answer"
                : outcome.state === "wrong"
                  ? "is-status-sem_gabarito"
                  : "is-missing";
            return `
              <article class="simulation-review-item">
                <div class="simulation-review-copy">
                  <strong>Questão ${String(question.order).padStart(2, "0")} · ${escapeHtml(
                    question.discipline,
                  )}</strong>
                  <p>${escapeHtml(contentSummaryText(question))}</p>
                  <small>Sua resposta: ${escapeHtml(outcome.selected || "—")} · Correta: ${escapeHtml(
                    outcome.correct || "—",
                  )}</small>
                </div>
                <div class="simulation-review-actions">
                  <span class="pill ${statusClass}">${escapeHtml(statusLabel)}</span>
                  <button
                    class="mini-button is-light"
                    type="button"
                    data-sim-review-question="${index}"
                  >
                    Revisar
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function simulationRunningMarkup(session) {
  const question = simulationCurrentQuestion();
  if (!question) {
    return '<div class="empty-state">Não foi possível montar este simulado agora.</div>';
  }

  const questions = simulationQuestions();
  const answered = simulationAnsweredCount();
  const unanswered = simulationUnansweredCount();
  const selectedAnswer = simulationSelectedAnswer(question.id);
  const isFirst = session.currentIndex === 0;
  const isLast = session.currentIndex === questions.length - 1;

  simulationCountText(
    `${simulationLabel(session)} · ${answered}/${questions.length} respondidas`,
  );

  return `
    <div class="simulation-shell">
      <section class="simulation-banner">
        <div>
          <strong>${escapeHtml(simulationLabel(session))}</strong>
          <p>Questão ${question.order} de ${questions.length} · ${answered} respondidas · ${unanswered} em aberto</p>
        </div>
        <div class="simulation-banner-meta">
          <span class="pill is-discipline">${escapeHtml(question.discipline)}</span>
          <span class="pill">${escapeHtml(String(question.year))}</span>
          <span class="pill">${escapeHtml(session.data?.type === "treino-por-disciplina" ? "Treino" : "Simulado")}</span>
        </div>
      </section>

      <div class="simulation-stepper" aria-label="Navegação entre questões">
        ${questions.map(simulationQuestionButton).join("")}
      </div>

      <article class="question-card simulation-question-card">
        <div class="question-top">
          <span class="pill">Questão ${String(question.order).padStart(2, "0")}</span>
          <span class="pill is-discipline">${escapeHtml(question.discipline)}</span>
          <span class="pill">${escapeHtml(String(question.year))}</span>
        </div>
        <h2 class="question-title">${escapeHtml(question.area || `Questão ${question.order}`)}</h2>
        ${supportTextMarkup(question)}
        ${questionImages(question)}
        ${referenceMarkup(question)}
        ${
          question.statement
            ? `<pre class="statement">${escapeHtml(question.statement)}</pre>`
            : '<p class="empty-statement">Texto não extraído automaticamente. Consulte o PDF da prova.</p>'
        }
        <div class="question-support-grid">
          <div class="question-support-card">
            <strong>Assunto</strong>
            <span>${escapeHtml(contentSummaryText(question))}</span>
          </div>
        </div>
        <div class="simulation-alternatives" role="group" aria-label="Alternativas da questão">
          ${question.alternatives.map((alternative) => simulationAlternativeMarkup(question, alternative)).join("")}
        </div>
      </article>

      <div class="simulation-footer">
        <div class="simulation-footer-nav">
          <button class="mini-button is-light" type="button" data-sim-nav="prev" ${
            isFirst ? "disabled" : ""
          }>Anterior</button>
          <button class="mini-button is-light" type="button" data-sim-nav="next" ${
            isLast ? "disabled" : ""
          }>Próxima</button>
        </div>
        <div class="simulation-footer-status">
          ${
            selectedAnswer
              ? `Resposta marcada: <strong>${escapeHtml(selectedAnswer)}</strong>`
              : "Nenhuma resposta marcada nesta questão."
          }
        </div>
        <button class="tool-button" type="button" data-sim-finish="true">Finalizar simulado</button>
      </div>
    </div>
  `;
}

function buildSimulationResult(session) {
  const disciplineMap = new Map();
  const contentMap = new Map();
  let correct = 0;

  simulationQuestions().forEach((question) => {
    const selected = simulationSelectedAnswer(question.id);
    const hit = Boolean(selected && question.answer && selected === question.answer);
    if (hit) correct += 1;

    const disciplineKey = question.discipline;
    if (!disciplineMap.has(disciplineKey)) {
      disciplineMap.set(disciplineKey, { label: disciplineKey, correct: 0, total: 0 });
    }
    const disciplineEntry = disciplineMap.get(disciplineKey);
    disciplineEntry.total += 1;
    if (hit) disciplineEntry.correct += 1;

    const contentLabel = contentSummaryText(question);
    const contentKeyValue = `${question.discipline}::${contentLabel}`;
    if (!contentMap.has(contentKeyValue)) {
      contentMap.set(contentKeyValue, {
        id: contentKeyValue,
        discipline: question.discipline,
        label: contentLabel,
        correct: 0,
        total: 0,
      });
    }
    const contentEntry = contentMap.get(contentKeyValue);
    contentEntry.total += 1;
    if (hit) contentEntry.correct += 1;
  });

  const total = simulationQuestions().length;
  const answered = simulationAnsweredCount();

  return {
    total,
    answered,
    unanswered: total - answered,
    correct,
    percent: total ? (correct / total) * 100 : 0,
    byDiscipline: disciplineOrder
      .map((discipline) => disciplineMap.get(discipline))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        wrong: item.total - item.correct,
        percent: item.total ? (item.correct / item.total) * 100 : 0,
      })),
    byContent: [...contentMap.values()]
      .map((item) => ({
        ...item,
        wrong: item.total - item.correct,
        percent: item.total ? (item.correct / item.total) * 100 : 0,
      }))
      .sort((a, b) => {
        const disciplineDiff =
          disciplineOrder.indexOf(a.discipline) - disciplineOrder.indexOf(b.discipline);
        return disciplineDiff || b.total - a.total || a.label.localeCompare(b.label, "pt-BR");
      }),
  };
}

function simulationBreakdownMarkup(items, kind) {
  if (!items.length) {
    return '<div class="empty-state">Nenhum dado para resumir neste simulado.</div>';
  }

  return `
    <div class="simulation-breakdown-list">
      ${items
        .map((item) => {
          const secondary =
            kind === "content" ? `<small>${escapeHtml(item.discipline)}</small>` : "";
          return `
            <article class="simulation-breakdown-item">
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                ${secondary}
              </div>
              <div class="simulation-breakdown-score">
                <span>${item.correct}/${item.total}</span>
                <small>${formatPercent(item.percent)}</small>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function simulationPerformanceBand(percent) {
  if (percent > 80) {
    return {
      title: "Ótimo ritmo de prova!",
      text: "Você foi muito bem nesta tentativa. Continue treinando para chegar ainda mais seguro à prova do IFF.",
      tone: "is-good",
    };
  }
  if (percent >= 50) {
    return {
      title: "Bom caminho para a prova",
      text: "Você já tem uma base boa. Agora vale revisar os assuntos em que mais errou para transformar mais questões em acerto.",
      tone: "is-warning",
    };
  }
  return {
    title: "Hora de reforçar a base",
    text: "Este resultado mostra que vale retomar os assuntos essenciais com calma. Revise os pontos com mais erros e depois tente novamente.",
    tone: "is-alert",
  };
}

function simulationInsightLabel(item) {
  return `${item.label} (${item.discipline})`;
}

function simulationFeedbackData(result) {
  const weakContents = [...result.byContent]
    .filter((item) => item.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.percent - b.percent || b.total - a.total)
    .slice(0, 3);
  const strongContents = [...result.byContent]
    .filter((item) => item.correct > 0)
    .sort((a, b) => b.correct - a.correct || b.percent - a.percent || b.total - a.total)
    .slice(0, 3);
  const band = simulationPerformanceBand(result.percent);

  return {
    band,
    weakContents,
    strongContents,
    reviewMessage: weakContents.length
      ? `Agora vale revisar: ${weakContents.map((item) => simulationInsightLabel(item)).join(", ")}.`
      : "Você foi bem nos assuntos desta tentativa.",
  };
}

function simulationInsightListMarkup(items, tone, mode) {
  if (!items.length) {
    return `<p class="simulation-feedback-empty">${
      mode === "error"
        ? "Seus erros ficaram bem distribuídos neste simulado."
        : "Ainda é cedo para destacar um ponto forte nesta tentativa."
    }</p>`;
  }

  return `
    <div class="simulation-insight-list">
      ${items
        .map((item) => {
          const label = mode === "error" ? `${item.wrong} erro(s)` : `${item.correct} acerto(s)`;
          const studyButton =
            mode === "error"
              ? `
                <button
                  class="mini-button is-light"
                  type="button"
                  data-study-content="${escapeHtml(contentKey(item.discipline, item.label))}"
                  data-study-discipline="${escapeHtml(item.discipline)}"
                >
                  Estudar ${escapeHtml(item.label)}
                </button>
              `
              : "";
          return `
            <article class="simulation-insight-item ${tone}">
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <small>${escapeHtml(item.discipline)}</small>
              </div>
              <div class="simulation-insight-actions">
                <span class="simulation-insight-score">${escapeHtml(label)}</span>
                ${studyButton}
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function simulationPriorityTargets(total) {
  if (total >= 40) return { alta: 28, media: 10, baixa: 2 };
  if (total >= 20) return { alta: 14, media: 5, baixa: 1 };
  return { alta: 7, media: 2, baixa: 1 };
}

function shuffleSimulationPool(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function selectRetryQuestionsByPriority(pool, total) {
  const plan = simulationPriorityTargets(total);
  const selected = [];
  const selectedIds = new Set();
  const priorities = ["alta", "media", "baixa"];

  const takeFromPool = (items, amount) => {
    const picked = [];
    for (const question of items) {
      if (picked.length >= amount) break;
      if (selectedIds.has(question.id)) continue;
      selectedIds.add(question.id);
      picked.push(question);
    }
    return picked;
  };

  priorities.forEach((priority) => {
    const bucket = shuffleSimulationPool(pool.filter((question) => question.prioridade === priority));
    selected.push(...takeFromPool(bucket, plan[priority] || 0));
  });

  if (selected.length < total) {
    const fallback = shuffleSimulationPool(pool);
    selected.push(...takeFromPool(fallback, total - selected.length));
  }

  return shuffleSimulationPool(selected).slice(0, total);
}

function buildRetrySimulationFromErrors() {
  const session = state.simuladoSession;
  const result = session?.result;
  if (!session || !result) return null;

  const weakContents = simulationFeedbackData(result).weakContents;
  if (!weakContents.length) return null;

  const currentQuestions = simulationQuestions();
  const currentQuestionIds = new Set(currentQuestions.map((question) => question.id));
  const weakKeys = new Set(
    weakContents.map((item) => `${item.discipline}::${item.label}`),
  );
  const validPool = simulationPool();
  const matchingPool = validPool.filter((question) =>
    weakKeys.has(`${question.discipline}::${contentSummaryText(question)}`),
  );
  const freshPool = matchingPool.filter((question) => !currentQuestionIds.has(question.id));
  const desiredTotal = currentQuestions.length || 10;
  const basePool = freshPool.length >= desiredTotal ? freshPool : matchingPool;
  const selected = selectRetryQuestionsByPriority(basePool, desiredTotal);
  if (!selected.length) return null;

  return {
    type: "treino-focado-erros",
    discipline: "",
    questions: selected.map((question, index) => ({
      ...question,
      order: index + 1,
    })),
    total: selected.length,
    focusContents: weakContents.map((item) => simulationInsightLabel(item)),
  };
}

function simulationResultMarkup(session) {
  const result = session.result || buildSimulationResult(session);
  simulationCountText(
    `${result.correct} acertos de ${result.total} · ${formatPercent(result.percent)}`,
  );

  return `
    <div class="simulation-shell">
      <section class="simulation-banner">
        <div>
          <strong>${escapeHtml(simulationLabel(session))}</strong>
          <p>Seu resultado está pronto. Veja onde você foi bem e o que vale revisar agora.</p>
        </div>
        <div class="simulation-banner-meta">
          <span class="pill is-answer">${result.correct} acertos</span>
          <span class="pill">${formatPercent(result.percent)}</span>
          <span class="pill is-missing">${result.unanswered} em branco</span>
        </div>
      </section>

      <section class="simulation-summary-grid" aria-label="Resumo do resultado">
        <article class="simulation-summary-card">
          <small>Acertos</small>
          <strong>${result.correct}/${result.total}</strong>
        </article>
        <article class="simulation-summary-card">
          <small>Percentual</small>
          <strong>${formatPercent(result.percent)}</strong>
        </article>
        <article class="simulation-summary-card">
          <small>Respondidas</small>
          <strong>${result.answered}/${result.total}</strong>
        </article>
        <article class="simulation-summary-card">
          <small>Assuntos</small>
          <strong>${result.byContent.length}</strong>
        </article>
      </section>

      <div class="simulation-results-grid">
        <section class="simulation-results-card">
          <header>
            <h2>Seu desempenho por disciplina</h2>
          </header>
          ${simulationBreakdownMarkup(result.byDiscipline, "discipline")}
        </section>

        <section class="simulation-results-card">
          <header>
            <h2>Seu desempenho por assunto</h2>
          </header>
          ${simulationBreakdownMarkup(result.byContent, "content")}
        </section>
      </div>

      <div class="card-actions">
        <button class="mini-button is-light" type="button" data-sim-review="true">Revisar respostas</button>
        <button class="tool-button" type="button" data-sim-reset="true">Novo simulado</button>
      </div>
    </div>
  `;
}

function simulationRunningMarkupEnhanced(session) {
  const question = simulationCurrentQuestion();
  if (!question) {
    return '<div class="empty-state">Não foi possível montar este simulado agora.</div>';
  }

  const questions = simulationQuestions();
  const answered = simulationAnsweredCount();
  const unanswered = simulationUnansweredCount();
  const isReview = session.stage === "review";
  const selectedAnswer = simulationSelectedAnswer(question.id);
  const outcome = simulationQuestionOutcome(question);
  const isFirst = session.currentIndex === 0;
  const isLast = session.currentIndex === questions.length - 1;
  const directNextUnanswered = simulationNextUnansweredIndex();
  const firstUnanswered = questions.findIndex(
    (item) => !simulationSelectedAnswer(item.id),
  );
  const nextUnansweredIndex =
    directNextUnanswered >= 0 ? directNextUnanswered : firstUnanswered;
  const positionPercent = simulationCurrentPositionPercent();
  const progressPercent = simulationProgressPercent();
  const currentLabel = `${String(question.order).padStart(2, "0")}/${String(questions.length).padStart(2, "0")}`;

  simulationCountText(
    isReview
      ? `${simulationLabel(session)} - revisão de ${questions.length} questões`
      : `${simulationLabel(session)} - ${answered}/${questions.length} respondidas`,
  );

  return `
    <div class="simulation-shell">
      <section class="simulation-banner">
        <div>
          <strong>${escapeHtml(simulationLabel(session))}</strong>
          <p>${
            isReview
              ? `Revisão da questão ${question.order} de ${questions.length} - ${answered} respondidas - ${unanswered} em aberto`
              : `Questão ${question.order} de ${questions.length} - ${answered} respondidas - ${unanswered} em aberto`
          }</p>
        </div>
        <div class="simulation-banner-meta">
          <span class="pill is-discipline">${escapeHtml(question.discipline)}</span>
          <span class="pill">${escapeHtml(String(question.year))}</span>
          <span class="pill">${escapeHtml(session.data?.type === "treino-por-disciplina" ? "Treino" : "Simulado")}</span>
          ${isReview ? '<span class="pill is-answer">Modo revisão</span>' : ""}
        </div>
      </section>

      <section class="simulation-progress-grid" aria-label="Resumo do andamento">
        <article class="simulation-progress-card">
          <small>Questão atual</small>
          <strong>${escapeHtml(currentLabel)}</strong>
          <div class="simulation-progress-bar" aria-hidden="true">
            <span style="width: ${positionPercent}%"></span>
          </div>
          <p>${positionPercent}% do percurso percorrido</p>
        </article>

        <article class="simulation-progress-card">
          <small>Respondidas</small>
          <strong>${answered}/${questions.length}</strong>
          <div class="simulation-progress-bar is-answer" aria-hidden="true">
            <span style="width: ${progressPercent}%"></span>
          </div>
          <p>${progressPercent}% concluído</p>
        </article>

        <article class="simulation-progress-card">
          <small>Em aberto</small>
          <strong>${unanswered}</strong>
          <p>${
            unanswered
              ? "Use a navegação para fechar as pendências antes de finalizar."
              : "Tudo respondido. Agora vale uma revisão calma."
          }</p>
          ${
            !isReview
              ? `
                <button
                  class="mini-button is-light"
                  type="button"
                  data-sim-next-open="${nextUnansweredIndex}"
                  ${nextUnansweredIndex < 0 ? "disabled" : ""}
                >
                  Próxima em aberto
                </button>
              `
              : `
                <button class="mini-button is-light" type="button" data-sim-back-result="true">
                  Voltar ao resultado
                </button>
              `
          }
        </article>
      </section>

      <div class="simulation-stepper" aria-label="Navegação entre questões">
        ${questions.map(simulationQuestionButton).join("")}
      </div>

      <article class="question-card simulation-question-card">
        <div class="question-top">
          <span class="pill">Questão ${String(question.order).padStart(2, "0")}</span>
          <span class="pill is-discipline">${escapeHtml(question.discipline)}</span>
          <span class="pill">${escapeHtml(String(question.year))}</span>
        </div>
        <h2 class="question-title">${escapeHtml(question.area || `Questão ${question.order}`)}</h2>
        ${isReview ? simulationReviewSummary(question) : ""}
        ${supportTextMarkup(question)}
        ${questionImages(question)}
        ${referenceMarkup(question)}
        ${
          question.statement
            ? `<pre class="statement">${escapeHtml(question.statement)}</pre>`
            : '<p class="empty-statement">Texto não extraído automaticamente. Consulte o PDF da prova.</p>'
        }
        <div class="question-support-grid">
          <div class="question-support-card">
            <strong>Assunto</strong>
            <span>${escapeHtml(contentSummaryText(question))}</span>
          </div>
          ${
            isReview
              ? `
                <div class="question-support-card">
                  <strong>Sua resposta</strong>
                  <span>${escapeHtml(outcome.selected || "Em branco")}</span>
                </div>
                <div class="question-support-card">
                  <strong>Resposta correta</strong>
                  <span>${escapeHtml(outcome.correct || "Sem gabarito")}</span>
                </div>
              `
              : ""
          }
        </div>
        <div class="simulation-alternatives" role="group" aria-label="Alternativas da questão">
          ${question.alternatives.map((alternative) => simulationAlternativeMarkup(question, alternative)).join("")}
        </div>
      </article>

      <div class="simulation-footer">
        <div class="simulation-footer-nav">
          <button class="mini-button is-light" type="button" data-sim-nav="prev" ${
            isFirst ? "disabled" : ""
          }>Anterior</button>
          <button class="mini-button is-light" type="button" data-sim-nav="next" ${
            isLast ? "disabled" : ""
          }>Próxima</button>
        </div>
        <div class="simulation-footer-status">
          ${
            isReview
              ? `Sua resposta: <strong>${escapeHtml(outcome.selected || "Em branco")}</strong> - Correta: <strong>${escapeHtml(
                  outcome.correct || "Sem gabarito",
                )}</strong>`
              : selectedAnswer
                ? `Resposta marcada: <strong>${escapeHtml(selectedAnswer)}</strong>`
                : "Nenhuma resposta marcada nesta questão."
          }
        </div>
        ${
          isReview
            ? '<button class="tool-button" type="button" data-sim-back-result="true">Voltar ao resultado</button>'
            : '<button class="tool-button" type="button" data-sim-finish="true">Finalizar simulado</button>'
        }
      </div>
    </div>
  `;
}

function simulationResultMarkupEnhanced(session) {
  const result = session.result || buildSimulationResult(session);
  const feedback = simulationFeedbackData(result);
  simulationCountText(
    `${result.correct} acertos de ${result.total} - ${formatPercent(result.percent)}`,
  );

  return `
    <div class="simulation-shell">
      <section class="simulation-banner">
        <div>
          <strong>${escapeHtml(simulationLabel(session))}</strong>
          <p>Confira seu resultado e escolha o próximo passo para chegar mais forte à prova do IFF.</p>
        </div>
        <div class="simulation-banner-meta">
          <span class="pill is-answer">${result.correct} acertos</span>
          <span class="pill">${formatPercent(result.percent)}</span>
          <span class="pill is-missing">${result.unanswered} em branco</span>
        </div>
      </section>

      <section class="simulation-summary-grid" aria-label="Resumo do resultado">
        <article class="simulation-summary-card">
          <small>Acertos</small>
          <strong>${result.correct}/${result.total}</strong>
        </article>
        <article class="simulation-summary-card">
          <small>Percentual</small>
          <strong>${formatPercent(result.percent)}</strong>
        </article>
        <article class="simulation-summary-card">
          <small>Respondidas</small>
          <strong>${result.answered}/${result.total}</strong>
        </article>
        <article class="simulation-summary-card">
          <small>Assuntos</small>
          <strong>${result.byContent.length}</strong>
        </article>
      </section>

      <section class="simulation-feedback-grid" aria-label="O que seu resultado mostra">
        <article class="simulation-feedback-card ${feedback.band.tone}">
          <header>
            <h2>${escapeHtml(feedback.band.title)}</h2>
          </header>
          <p>${escapeHtml(feedback.band.text)}</p>
          <p class="simulation-feedback-highlight">${escapeHtml(feedback.reviewMessage)}</p>
        </article>

        <article class="simulation-feedback-card is-alert">
          <header>
            <h2>Assuntos para revisar agora</h2>
          </header>
          ${simulationInsightListMarkup(feedback.weakContents, "is-alert", "error")}
        </article>

        <article class="simulation-feedback-card is-good">
          <header>
            <h2>Seus pontos fortes</h2>
          </header>
          ${simulationInsightListMarkup(feedback.strongContents, "is-good", "success")}
        </article>
      </section>

      <div class="simulation-results-grid">
        <section class="simulation-results-card">
          <header>
            <h2>Seu resultado por disciplina</h2>
          </header>
          ${simulationBreakdownMarkup(result.byDiscipline, "discipline")}
        </section>

        <section class="simulation-results-card">
          <header>
            <h2>Seu resultado por assunto</h2>
          </header>
          ${simulationBreakdownMarkup(result.byContent, "content")}
        </section>
      </div>

      ${simulationReviewListMarkup()}

      <div class="card-actions">
        <button
          class="mini-button is-light"
          type="button"
          data-sim-retry-errors="true"
          ${feedback.weakContents.length ? "" : "disabled"}
        >
          Refazer focando nos erros
        </button>
        <button class="mini-button is-light" type="button" data-sim-review="true">Revisar respostas</button>
        <button class="tool-button" type="button" data-sim-reset="true">Novo simulado</button>
      </div>
    </div>
  `;
}

function renderSimulation() {
  const root = $("#simulationRoot");
  if (!root || !state.catalog) return;

  const session = state.simuladoSession || createEmptySimulationSession();
  if (session.stage === "running" || session.stage === "review") {
    root.innerHTML = simulationRunningMarkupEnhanced(session);
    return;
  }
  if (session.stage === "finished") {
    root.innerHTML = simulationResultMarkupEnhanced(session);
    return;
  }
  root.innerHTML = simulationSetupMarkup();
}

function startSimulation(mode, discipline = "") {
  if (!state.simulados) return;

  try {
    let data = null;
    if (mode === "rapido") data = state.simulados.gerarSimuladoRapido();
    if (mode === "medio") data = state.simulados.gerarSimuladoMedio();
    if (mode === "completo") data = state.simulados.gerarSimuladoCompleto();
    if (mode === "treino") data = state.simulados.gerarTreinoPorDisciplina(discipline);

    if (!data) throw new Error("Não foi possível gerar o simulado.");

    state.simuladoSession = {
      stage: "running",
      mode,
      label:
        mode === "treino"
          ? `Treino de ${data.discipline || discipline} (10)`
          : simulationModeLabels[mode] || simulationTypeLabels[data.type] || "Simulado",
      discipline: data.discipline || discipline || "",
      data,
      currentIndex: 0,
      answers: {},
      result: null,
    };
    if (state.view !== "simulado") {
      setView("simulado");
      return;
    }
    renderSimulation();
  } catch (error) {
    console.error(error);
    throw error;
    toast(error?.message || "Não foi possível iniciar este simulado.");
  }
}

function goToSimulationQuestion(index) {
  const total = simulationQuestions().length;
  if (!total) return;
  state.simuladoSession.currentIndex = Math.min(Math.max(Number(index) || 0, 0), total - 1);
  renderSimulation();
}

function selectSimulationAnswer(questionId, answer) {
  if (state.simuladoSession.stage !== "running") return;
  state.simuladoSession.answers = {
    ...state.simuladoSession.answers,
    [questionId]: answer,
  };
  renderSimulation();
}

function finishSimulation() {
  if (state.simuladoSession.stage !== "running") return;
  const unanswered = simulationUnansweredCount();
  if (unanswered > 0) {
    const shouldFinish = window.confirm(
      `Ainda faltam ${countLabel(unanswered, "questão", "questões")} sem resposta. Deseja finalizar mesmo assim?`,
    );
    if (!shouldFinish) return;
  }
  state.simuladoSession.result = buildSimulationResult(state.simuladoSession);
  state.simuladoSession.stage = "finished";
  renderSimulation();
}

function retrySimulationFromErrors() {
  const data = buildRetrySimulationFromErrors();
  if (!data) {
    toast("Ainda não há assuntos com erro suficientes para montar um reforço agora.");
    return;
  }

  state.simuladoSession = {
    stage: "running",
    mode: "reforco-erros",
    label: `Refazer focando nos erros (${data.total})`,
    discipline: "",
    data,
    currentIndex: 0,
    answers: {},
    result: null,
  };

  if (state.view !== "simulado") {
    setView("simulado");
    return;
  }
  renderSimulation();
}

function studyContentNow(discipline, descriptorKey) {
  const focusedQuestions = simulationQuestions()
    .filter(
      (question) =>
        question.discipline === discipline &&
        contentKey(question.discipline, contentSummary(question)) === descriptorKey,
    )
    .filter((question) => simulationQuestionOutcome(question).state !== "correct")
    .map((question) => question.id);
  const contentItem = contentPool().find((item) => item.id === descriptorKey);

  state.studyFocus = {
    active: true,
    discipline: discipline || "all",
    descriptorKey: descriptorKey || "all",
    contentLabel: contentItem?.label || "",
    prioritizedQuestionIds: focusedQuestions,
  };
  state.filters = {
    query: "",
    year: "all",
    discipline: discipline || "all",
    priority: "all",
    descriptor: descriptorKey || "all",
    answer: "all",
    resolution: "all",
    visual: "all",
  };

  $("#searchInput").value = "";
  $("#yearFilter").value = "all";
  $("#disciplineFilter").value = discipline || "all";
  $("#priorityFilter").value = "all";
  $("#descriptorFilter").value = descriptorKey || "all";
  $("#answerFilter").value = "all";
  $("#resolutionFilter").value = "all";
  $("#visualFilter").value = "all";
  state.limit = PAGE_SIZE;
  setView("questoes");
}

function resetSimulation() {
  state.simuladoSession = createEmptySimulationSession();
  renderSimulation();
}

function renderCurrentView() {
  if (!state.catalog) return;
  if (state.view === "questoes") renderQuestions();
  if (state.view === "simulado") renderSimulation();
  if (state.view === "provas") renderSources();
  if (state.view === "descritores") renderDescriptors();
  if (state.view === "resolucoes") renderResolutions();
}

function renderAll() {
  updateStats();
  renderQuestions();
  renderSimulation();
  renderSources();
  renderDescriptors();
  renderResolutions();
}

function exposeSimulationApi() {
  window.gerarSimuladoRapido = () => {
    if (!state.simulados) throw new Error("Catálogo ainda não carregado.");
    return state.simulados.gerarSimuladoRapido();
  };
  window.gerarSimuladoMedio = () => {
    if (!state.simulados) throw new Error("Catálogo ainda não carregado.");
    return state.simulados.gerarSimuladoMedio();
  };
  window.gerarSimuladoCompleto = () => {
    if (!state.simulados) throw new Error("Catálogo ainda não carregado.");
    return state.simulados.gerarSimuladoCompleto();
  };
  window.gerarTreinoPorDisciplina = (disciplina) => {
    if (!state.simulados) throw new Error("Catálogo ainda não carregado.");
    return state.simulados.gerarTreinoPorDisciplina(disciplina);
  };
}

function syncFiltersFromControls() {
  state.studyFocus = createEmptyStudyFocus();
  state.filters.query = $("#searchInput").value;
  state.filters.year = $("#yearFilter").value;
  state.filters.discipline = $("#disciplineFilter").value;
  state.filters.priority = $("#priorityFilter").value;
  state.filters.descriptor = $("#descriptorFilter").value;
  state.filters.answer = $("#answerFilter").value;
  state.filters.resolution = $("#resolutionFilter").value;
  state.filters.visual = $("#visualFilter").value;
  state.limit = PAGE_SIZE;
  renderAll();
}

function clearFilters() {
  state.studyFocus = createEmptyStudyFocus();
  state.filters = {
    query: "",
    year: "all",
    discipline: "all",
    priority: "all",
    descriptor: "all",
    answer: "all",
    resolution: "all",
    visual: "all",
  };
  $("#searchInput").value = "";
  $("#yearFilter").value = "all";
  $("#disciplineFilter").value = "all";
  $("#priorityFilter").value = "all";
  $("#descriptorFilter").value = "all";
  $("#answerFilter").value = "all";
  $("#resolutionFilter").value = "all";
  $("#visualFilter").value = "all";
  state.limit = PAGE_SIZE;
  renderAll();
}

function openPdf(sourceOrPdf, switchToView = true, title = "", page = "") {
  const source =
    typeof sourceOrPdf === "string"
      ? state.catalog.sources.find((item) => item.pdf === sourceOrPdf) || {
          pdf: sourceOrPdf,
          title,
        }
      : sourceOrPdf;
  const suffix = page ? `#page=${page}` : "";
  state.selectedPdf = source;
  $("#pdfTitle").textContent = source.title || title || "PDF";
  $("#pdfViewer").src = `${source.pdf}${suffix}`;
  $("#pdfOpenLink").href = `${source.pdf}${suffix}`;
  if (switchToView) setView("provas");
  else renderSources();
}

function jumpToQuestion(questionId) {
  const question = questionById(questionId);
  if (!question) return;
  clearFilters();
  $("#yearFilter").value = String(question.year);
  $("#disciplineFilter").value = question.discipline;
  state.filters.year = String(question.year);
  state.filters.discipline = question.discipline;
  setView("questoes");
  window.setTimeout(() => {
    const card = $(`[data-question-id="${CSS.escape(questionId)}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 80);
}

function bindEvents() {
  $$(".tab").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  $("#searchInput").addEventListener("input", syncFiltersFromControls);
  [
    "#yearFilter",
    "#disciplineFilter",
    "#priorityFilter",
    "#descriptorFilter",
    "#answerFilter",
    "#resolutionFilter",
    "#visualFilter",
  ].forEach((selector) => {
    $(selector).addEventListener("change", syncFiltersFromControls);
  });

  $("#clearFilters").addEventListener("click", clearFilters);
  $("#moreButton").addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    renderQuestions();
  });

  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    if (target.dataset.simStart) {
      const discipline =
        target.dataset.simStart === "treino"
          ? $("#simulationDisciplineSelect")?.value || availableSimulationDisciplines()[0] || ""
          : "";
      startSimulation(target.dataset.simStart, discipline);
    }
    if (target.dataset.simQuestion) {
      goToSimulationQuestion(target.dataset.simQuestion);
    }
    if (target.dataset.simAnswer && target.dataset.questionId) {
      selectSimulationAnswer(target.dataset.questionId, target.dataset.simAnswer);
    }
    if (target.dataset.simNav === "prev") {
      goToSimulationQuestion(state.simuladoSession.currentIndex - 1);
    }
    if (target.dataset.simNav === "next") {
      goToSimulationQuestion(state.simuladoSession.currentIndex + 1);
    }
    if (target.dataset.simFinish) {
      finishSimulation();
    }
    if (target.dataset.simReset) {
      resetSimulation();
    }
    if (target.dataset.simReview) {
      state.simuladoSession.stage = "review";
      state.simuladoSession.currentIndex = 0;
      renderSimulation();
    }
    if (target.dataset.simRetryErrors) {
      retrySimulationFromErrors();
    }
    if (target.dataset.studyContent) {
      studyContentNow(target.dataset.studyDiscipline || "all", target.dataset.studyContent);
    }
    if (target.dataset.simReviewQuestion !== undefined) {
      state.simuladoSession.stage = "review";
      goToSimulationQuestion(target.dataset.simReviewQuestion);
    }
    if (target.dataset.simNextOpen !== undefined) {
      const nextIndex = Number(target.dataset.simNextOpen);
      if (Number.isInteger(nextIndex) && nextIndex >= 0) {
        goToSimulationQuestion(nextIndex);
      }
    }
    if (target.dataset.simBackResult) {
      state.simuladoSession.stage = "finished";
      renderSimulation();
    }
    if (target.dataset.openPdf) {
      openPdf(target.dataset.openPdf, true, target.dataset.pdfTitle, target.dataset.pdfPage);
    }
    if (target.dataset.openSource) {
      openPdf(target.dataset.openSource, false, target.dataset.sourceTitle);
    }
    if (target.dataset.disciplineFilter) {
      state.studyFocus = createEmptyStudyFocus();
      state.filters.discipline = target.dataset.disciplineFilter;
      state.filters.descriptor = "all";
      $("#disciplineFilter").value = target.dataset.disciplineFilter;
      $("#descriptorFilter").value = "all";
      state.limit = PAGE_SIZE;
      setView("descritores");
    }
    if (target.dataset.setDescriptor || target.dataset.descriptorFilter) {
      state.studyFocus = createEmptyStudyFocus();
      const key = target.dataset.setDescriptor || target.dataset.descriptorFilter;
      const descriptorItem = contentPool().find((item) => item.id === key);
      if (descriptorItem) {
        state.filters.discipline = descriptorItem.discipline;
        $("#disciplineFilter").value = descriptorItem.discipline;
      }
      state.filters.descriptor = key;
      $("#descriptorFilter").value = key;
      state.limit = PAGE_SIZE;
      setView("questoes");
    }
    if (target.dataset.jumpQuestion) {
      jumpToQuestion(target.dataset.jumpQuestion);
    }
  });
}

function bindAccessGate() {
  const form = $("#accessForm");
  const input = $("#accessPasswordInput");
  if (!form || !input) return;

  input.addEventListener("input", () => setAccessError(""));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = input.value.trim();

    if (password !== ACCESS_PASSWORD) {
      setAccessError("Senha incorreta. Tente novamente.");
      input.focus();
      input.select();
      return;
    }

    setAccessError("");
    setAccessLoading(true);
    writeStoredAccess(true);
    applyAccessState(true);

    try {
      await ensureApplicationLoaded();
      input.value = "";
    } finally {
      setAccessLoading(false);
    }
  });
}

async function bootApplication() {
  try {
    const catalogResponse = await fetch(`data/catalog.json?v=${encodeURIComponent(ASSET_VERSION)}`, {
      cache: "no-store",
    });
    state.catalog = await catalogResponse.json();
    state.catalog.questions = (state.catalog.questions || []).map(normalizeQuestion);
    state.catalog.questoesValidas = state.catalog.questions.filter(
      (question) => question.status === "completa",
    );
    state.catalog.questoesSimuladoValidas = state.catalog.questoesValidas.filter(
      (question) => question.elegivelSimulado !== false,
    );
    state.simulados = createSimuladoApi(state.catalog.questoesSimuladoValidas);
    exposeSimulationApi();
    state.catalog.contentSummaries = buildContentPool(state.catalog.questions);
    state.catalog.conteudosValidos = buildContentPool(state.catalog.questoesValidas);
    const validQuestionIds = new Set(state.catalog.questoesValidas.map((question) => question.id));
    state.catalog.descritoresValidos = (state.catalog.descriptors || [])
      .map((descriptor) => {
        const questions = (descriptor.questions || []).filter((questionId) =>
          validQuestionIds.has(questionId),
        );
        return {
          ...descriptor,
          questions,
          count: questions.length,
        };
      })
      .filter((descriptor) => descriptor.count > 0);
    state.catalog.statsValidos = {
      ...state.catalog.stats,
      questions: state.catalog.questoesValidas.length,
      questionsWithAnswers: state.catalog.questoesValidas.filter((question) => question.answer).length,
      questionsWithDescriptors: state.catalog.questoesValidas.filter(
        (question) => question.descriptors.length,
      ).length,
      questionsWithContentSummary: state.catalog.questoesValidas.filter((question) =>
        String(question.conteudoResumo || "").trim(),
      ).length,
      years: unique(state.catalog.questoesValidas.map((question) => question.year)).sort(
        (a, b) => a - b,
      ),
      questionImages: state.catalog.questoesValidas.filter((question) => question.images?.length)
        .length,
    };
    populateFilters();
    bindEvents();
    clearFilters();
    const hashView = location.hash.replace("#", "");
    setView(
      ["questoes", "simulado", "provas", "descritores", "resolucoes"].includes(hashView)
        ? hashView
        : "questoes",
    );
    state.access.bootstrapped = true;
  } catch (error) {
    $("#questionList").innerHTML = `
      <div class="empty-state">
        Não foi possível carregar os dados. Inicie o site por um servidor local para permitir a leitura dos arquivos JSON.
      </div>
    `;
    console.error(error);
  }
}

function ensureApplicationLoaded() {
  if (state.access.bootstrapped) {
    return Promise.resolve();
  }
  if (state.access.bootPromise) {
    return state.access.bootPromise;
  }
  state.access.bootPromise = bootApplication().finally(() => {
    state.access.bootPromise = null;
  });
  return state.access.bootPromise;
}

async function init() {
  bindAccessGate();
  setAccessLoading(false);

  if (readStoredAccess()) {
    applyAccessState(true);
    try {
      await ensureApplicationLoaded();
    } catch (_error) {
      // Keep the shell visible so the existing error state remains visible.
    }
    return;
  }

  applyAccessState(false);
}

init();
