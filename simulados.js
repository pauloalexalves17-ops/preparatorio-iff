const PRIORITY_ORDER = ["alta", "media", "baixa"];

const DISCIPLINE_KEYS = {
  lingua_portuguesa: "Língua Portuguesa",
  matematica: "Matemática",
  ciencias_naturais: "Ciências Naturais",
  historia: "História",
  geografia: "Geografia",
};

const QUICK_TEMPLATE = {
  [DISCIPLINE_KEYS.lingua_portuguesa]: 2,
  [DISCIPLINE_KEYS.matematica]: 2,
  [DISCIPLINE_KEYS.ciencias_naturais]: 2,
  [DISCIPLINE_KEYS.historia]: 2,
  [DISCIPLINE_KEYS.geografia]: 2,
};

const MEDIUM_TEMPLATES = [
  {
    [DISCIPLINE_KEYS.lingua_portuguesa]: 5,
    [DISCIPLINE_KEYS.matematica]: 5,
    [DISCIPLINE_KEYS.ciencias_naturais]: 5,
    [DISCIPLINE_KEYS.historia]: 3,
    [DISCIPLINE_KEYS.geografia]: 2,
  },
  {
    [DISCIPLINE_KEYS.lingua_portuguesa]: 5,
    [DISCIPLINE_KEYS.matematica]: 5,
    [DISCIPLINE_KEYS.ciencias_naturais]: 5,
    [DISCIPLINE_KEYS.historia]: 2,
    [DISCIPLINE_KEYS.geografia]: 3,
  },
];

const COMPLETE_TEMPLATE = {
  [DISCIPLINE_KEYS.lingua_portuguesa]: 10,
  [DISCIPLINE_KEYS.matematica]: 10,
  [DISCIPLINE_KEYS.ciencias_naturais]: 10,
  [DISCIPLINE_KEYS.historia]: 5,
  [DISCIPLINE_KEYS.geografia]: 5,
};

const PRIORITY_TARGETS = {
  rapido: { alta: 7, media: 2, baixa: 1 },
  medio: { alta: 14, media: 5, baixa: 1 },
  completo: { alta: 28, media: 10, baixa: 2 },
  treino: { alta: 7, media: 2, baixa: 1 },
};

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePriority(value) {
  const normalized = normalizeText(value);
  if (normalized === "alta") return "alta";
  if (normalized === "baixa") return "baixa";
  return "media";
}

function normalizeDiscipline(value) {
  const normalized = normalizeText(value);
  const entry = Object.entries(DISCIPLINE_KEYS).find(([, label]) => normalizeText(label) === normalized);
  return entry ? entry[1] : String(value ?? "").trim();
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function ensureCompleteQuestions(questions) {
  return (questions || []).filter((question) => question?.status === "completa");
}

function buildQuestionView(question) {
  return {
    id: question.id,
    year: question.year,
    number: question.number,
    discipline: question.discipline,
    area: question.area,
    statement: question.statement,
    statementRaw: question.statementRaw,
    alternatives: question.alternatives,
    answer: question.answer,
    conteudoResumo: question.conteudoResumo,
    prioridade: normalizePriority(question.prioridade),
    resolution: question.resolution,
    images: question.images,
    page: question.page,
    sourcePdf: question.sourcePdf,
  };
}

function countBy(items, iteratee) {
  return items.reduce((accumulator, item) => {
    const key = iteratee(item);
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function generateDistributions(total, availability) {
  const distributions = [];
  const maxAlta = Math.min(total, availability.alta || 0);

  for (let alta = 0; alta <= maxAlta; alta += 1) {
    const remainingAfterAlta = total - alta;
    const maxMedia = Math.min(remainingAfterAlta, availability.media || 0);

    for (let media = 0; media <= maxMedia; media += 1) {
      const baixa = total - alta - media;
      if (baixa < 0) continue;
      if (baixa > (availability.baixa || 0)) continue;
      distributions.push({ alta, media, baixa });
    }
  }

  return distributions;
}

function buildAvailabilityIndex(questions, template) {
  return Object.fromEntries(
    Object.keys(template).map((discipline) => {
      const pool = questions.filter(
        (question) => normalizeText(question.discipline) === normalizeText(discipline),
      );
      return [
        discipline,
        {
          total: pool.length,
          alta: pool.filter((question) => normalizePriority(question.prioridade) === "alta").length,
          media: pool.filter((question) => normalizePriority(question.prioridade) === "media").length,
          baixa: pool.filter((question) => normalizePriority(question.prioridade) === "baixa").length,
        },
      ];
    }),
  );
}

function allocatePriorityPlan(template, targets, questions) {
  const disciplines = Object.keys(template);
  const availability = buildAvailabilityIndex(questions, template);
  const optionsByDiscipline = Object.fromEntries(
    disciplines.map((discipline) => [
      discipline,
      shuffle(generateDistributions(template[discipline], availability[discipline])),
    ]),
  );

  for (const discipline of disciplines) {
    if (!optionsByDiscipline[discipline].length) {
      throw new Error(`Nao ha combinacoes suficientes para a disciplina ${discipline}.`);
    }
  }

  const failed = new Set();

  function search(index, remaining) {
    if (index >= disciplines.length) {
      return remaining.alta === 0 && remaining.media === 0 && remaining.baixa === 0 ? [] : null;
    }

    const key = `${index}:${remaining.alta}:${remaining.media}:${remaining.baixa}`;
    if (failed.has(key)) return null;

    const discipline = disciplines[index];
    const options = optionsByDiscipline[discipline];

    for (const option of options) {
      if (
        option.alta > remaining.alta ||
        option.media > remaining.media ||
        option.baixa > remaining.baixa
      ) {
        continue;
      }

      const result = search(index + 1, {
        alta: remaining.alta - option.alta,
        media: remaining.media - option.media,
        baixa: remaining.baixa - option.baixa,
      });

      if (result) {
        return [{ discipline, ...option }, ...result];
      }
    }

    failed.add(key);
    return null;
  }

  const allocation = search(0, { ...targets });
  if (!allocation) {
    throw new Error("Nao foi possivel montar um simulado com a distribuicao pedida.");
  }
  return allocation;
}

function pickQuestionsByPriority(candidates, plan, usedIds) {
  const selected = [];

  for (const priority of PRIORITY_ORDER) {
    const amount = plan[priority] || 0;
    if (!amount) continue;

    const bucket = shuffle(
      candidates.filter(
        (question) =>
          normalizePriority(question.prioridade) === priority && !usedIds.has(question.id),
      ),
    );

    if (bucket.length < amount) {
      throw new Error(
        `Nao ha questoes suficientes em ${priority} para completar a selecao de ${amount} item(ns).`,
      );
    }

    for (const question of bucket.slice(0, amount)) {
      usedIds.add(question.id);
      selected.push(question);
    }
  }

  return selected;
}

function buildSimulation(questions, template, targets, type) {
  const validQuestions = ensureCompleteQuestions(questions);
  const allocation = allocatePriorityPlan(template, targets, validQuestions);
  const usedIds = new Set();
  const selected = [];

  for (const plan of allocation) {
    const { discipline, ...priorityPlan } = plan;
    const pool = validQuestions.filter(
      (question) => normalizeText(question.discipline) === normalizeText(discipline),
    );
    selected.push(...pickQuestionsByPriority(pool, priorityPlan, usedIds));
  }

  const ordered = shuffle(selected).map((question, index) => ({
    order: index + 1,
    ...buildQuestionView(question),
  }));

  return {
    type,
    total: ordered.length,
    generatedAt: new Date().toISOString(),
    disciplines: countBy(ordered, (question) => question.discipline),
    priorities: countBy(ordered, (question) => question.prioridade),
    allocation,
    questions: ordered,
  };
}

export function gerarSimuladoRapido(questions) {
  return buildSimulation(
    questions,
    QUICK_TEMPLATE,
    PRIORITY_TARGETS.rapido,
    "simulado-rapido",
  );
}

export function gerarSimuladoMedio(questions, options = {}) {
  const templateIndex = Number.isInteger(options.templateIndex)
    ? options.templateIndex
    : 0;
  const template = MEDIUM_TEMPLATES[Math.abs(templateIndex) % MEDIUM_TEMPLATES.length];
  return buildSimulation(
    questions,
    template,
    PRIORITY_TARGETS.medio,
    "simulado-medio",
  );
}

export function gerarSimuladoCompleto(questions) {
  return buildSimulation(
    questions,
    COMPLETE_TEMPLATE,
    PRIORITY_TARGETS.completo,
    "simulado-completo",
  );
}

export function gerarTreinoPorDisciplina(questions, disciplina) {
  const validQuestions = ensureCompleteQuestions(questions);
  const normalizedDiscipline = normalizeDiscipline(disciplina);
  const pool = validQuestions.filter(
    (question) =>
      normalizeText(question.discipline) === normalizeText(normalizedDiscipline),
  );

  if (!pool.length) {
    throw new Error(`Disciplina invalida ou sem questoes completas: ${disciplina}`);
  }

  const priorityPlan = PRIORITY_TARGETS.treino;
  const selected = pickQuestionsByPriority(pool, priorityPlan, new Set());
  const ordered = shuffle(selected).map((question, index) => ({
    order: index + 1,
    ...buildQuestionView(question),
  }));

  return {
    type: "treino-por-disciplina",
    total: ordered.length,
    generatedAt: new Date().toISOString(),
    discipline: normalizedDiscipline,
    priorities: countBy(ordered, (question) => question.prioridade),
    allocation: [{ discipline: normalizedDiscipline, ...priorityPlan }],
    questions: ordered,
  };
}

export function createSimuladoApi(questions) {
  const validQuestions = ensureCompleteQuestions(questions);
  let mediumRotation = 0;

  return {
    gerarSimuladoRapido: () => gerarSimuladoRapido(validQuestions),
    gerarSimuladoMedio: () => {
      const result = gerarSimuladoMedio(validQuestions, { templateIndex: mediumRotation });
      mediumRotation = (mediumRotation + 1) % MEDIUM_TEMPLATES.length;
      return result;
    },
    gerarSimuladoCompleto: () => gerarSimuladoCompleto(validQuestions),
    gerarTreinoPorDisciplina: (disciplina) =>
      gerarTreinoPorDisciplina(validQuestions, disciplina),
  };
}
