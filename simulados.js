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
  const entry = Object.entries(DISCIPLINE_KEYS).find(
    ([, label]) => normalizeText(label) === normalized,
  );
  return entry ? entry[1] : String(value ?? "").trim();
}

function normalizeGroupId(value) {
  return String(value ?? "").trim();
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function countBy(items, iteratee) {
  return items.reduce((accumulator, item) => {
    const key = iteratee(item);
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function ensureCompleteQuestions(questions) {
  return (questions || []).filter(
    (question) => question?.status === "completa" && question?.elegivelSimulado !== false,
  );
}

function questionHasVisibleSupport(question) {
  const images =
    (Array.isArray(question?.images) && question.images.length
      ? question.images
      : question?.imagemApoio) || [];
  return Boolean(
    String(question?.textoApoio || "").trim() ||
      (question?.fonteReferencia || []).length ||
      images.length,
  );
}

function buildSupportItem(question) {
  const images =
    (Array.isArray(question?.images) && question.images.length
      ? question.images
      : question?.imagemApoio) || [];
  return {
    questionId: question.id,
    questionNumber: question.number,
    textoApoio: String(question.textoApoio || "").trim(),
    fonteReferencia: Array.isArray(question.fonteReferencia) ? question.fonteReferencia : [],
    images: Array.isArray(images) ? images : [],
  };
}

function dedupeSupportItems(items) {
  const seenTexts = new Set();
  const seenReferences = new Set();
  const seenImages = new Set();

  return items
    .map((item) => {
      const textoApoio = String(item.textoApoio || "").trim();
      const uniqueText =
        textoApoio && !seenTexts.has(textoApoio) ? (seenTexts.add(textoApoio), textoApoio) : "";
      const uniqueReferences = (Array.isArray(item.fonteReferencia) ? item.fonteReferencia : [])
        .map((reference) => String(reference || "").trim())
        .filter(Boolean)
        .filter((reference) => {
          if (seenReferences.has(reference)) return false;
          seenReferences.add(reference);
          return true;
        });
      const uniqueImages = (Array.isArray(item.images) ? item.images : []).filter((image) => {
        const key = String(image?.src || "").trim();
        if (!key || seenImages.has(key)) return false;
        seenImages.add(key);
        return true;
      });

      return {
        ...item,
        textoApoio: uniqueText,
        fonteReferencia: uniqueReferences,
        images: uniqueImages,
      };
    })
    .filter(
      (item) =>
        item.textoApoio ||
        (Array.isArray(item.fonteReferencia) && item.fonteReferencia.length) ||
        (Array.isArray(item.images) && item.images.length),
    );
}

function buildGroupSupportItems(unit) {
  return dedupeSupportItems(
    [...(unit?.supportQuestions || [])]
      .sort((left, right) => {
        const leftOrder = Number(left.ordemNoGrupo || left.number || 0);
        const rightOrder = Number(right.ordemNoGrupo || right.number || 0);
        return leftOrder - rightOrder || Number(left.number || 0) - Number(right.number || 0);
      })
      .map(buildSupportItem),
  );
}

function buildQuestionView(question, unit) {
  const groupId = normalizeGroupId(question.grupoApoioId);
  const groupSize = unit?.size || 1;
  const groupOrder = Number(question.ordemNoGrupo || 0) || 1;
  const isGroupLead = Boolean(groupId) && groupOrder === 1;
  const groupSupportItems = isGroupLead ? buildGroupSupportItems(unit) : [];

  return {
    id: question.id,
    year: question.year,
    number: question.number,
    discipline: question.discipline,
    area: question.area,
    statement: question.statement,
    statementRaw: question.statementRaw,
    textoApoio: question.textoApoio,
    fonteReferencia: question.fonteReferencia,
    alternatives: question.alternatives,
    answer: question.answer,
    conteudoResumo: question.conteudoResumo,
    prioridade: normalizePriority(question.prioridade),
    resolution: question.resolution,
    images: question.images,
    page: question.page,
    sourcePdf: question.sourcePdf,
    grupoApoioId: groupId || null,
    ordemNoGrupo: groupId ? groupOrder : null,
    grupoApoioTamanho: groupId ? groupSize : 1,
    grupoApoioPrimeiraQuestao: Boolean(groupId) ? isGroupLead : false,
    apoioGrupo:
      groupId && groupSupportItems.length
        ? {
            id: groupId,
            kind: unit?.kind || "texto",
            items: groupSupportItems,
          }
        : null,
  };
}

function buildSimulationUnit(id, rawQuestions) {
  const questions = [...rawQuestions].sort((left, right) => {
    const leftOrder = Number(left.ordemNoGrupo || left.number || 0);
    const rightOrder = Number(right.ordemNoGrupo || right.number || 0);
    return leftOrder - rightOrder || Number(left.number || 0) - Number(right.number || 0);
  });
  const discipline = normalizeDiscipline(questions[0]?.discipline || "");
  const priorityCounts = countBy(questions, (question) => normalizePriority(question.prioridade));
  const groupId = normalizeGroupId(questions[0]?.grupoApoioId);
  const groupKind = groupId ? String(groupId).split("_")[2] || "texto" : "independente";

  return {
    id,
    groupId,
    kind: groupKind,
    discipline,
    size: questions.length,
    priorities: {
      alta: priorityCounts.alta || 0,
      media: priorityCounts.media || 0,
      baixa: priorityCounts.baixa || 0,
    },
    questions,
    supportQuestions: questions.filter(questionHasVisibleSupport),
  };
}

function buildSimulationUnits(questions) {
  const grouped = new Map();
  const units = [];

  for (const question of questions) {
    const groupId = normalizeGroupId(question.grupoApoioId);
    if (groupId) {
      if (!grouped.has(groupId)) grouped.set(groupId, []);
      grouped.get(groupId).push(question);
      continue;
    }
    units.push(buildSimulationUnit(`single:${question.id}`, [question]));
  }

  for (const [groupId, groupedQuestions] of grouped.entries()) {
    units.push(buildSimulationUnit(groupId, groupedQuestions));
  }

  return units;
}

function subtractPriorityCounts(base, delta) {
  return {
    alta: base.alta - (delta.alta || 0),
    media: base.media - (delta.media || 0),
    baixa: base.baixa - (delta.baixa || 0),
  };
}

function canFitPriorityCounts(remaining, unit) {
  return (
    (unit.priorities.alta || 0) <= remaining.alta &&
    (unit.priorities.media || 0) <= remaining.media &&
    (unit.priorities.baixa || 0) <= remaining.baixa
  );
}

function generateDisciplineCombos(units, quota, remainingTargets, limit = 240) {
  const candidates = shuffle(units).sort(
    (left, right) => right.size - left.size || left.id.localeCompare(right.id),
  );
  const results = [];

  function search(startIndex, remainingSize, currentTargets, pickedUnits) {
    if (!remainingSize) {
      results.push({
        units: [...pickedUnits],
        priorities: subtractPriorityCounts(remainingTargets, currentTargets),
      });
      return;
    }
    if (results.length >= limit || startIndex >= candidates.length) return;

    for (let index = startIndex; index < candidates.length; index += 1) {
      const unit = candidates[index];
      if (unit.size > remainingSize) continue;
      if (!canFitPriorityCounts(currentTargets, unit)) continue;

      pickedUnits.push(unit);
      search(
        index + 1,
        remainingSize - unit.size,
        subtractPriorityCounts(currentTargets, unit.priorities),
        pickedUnits,
      );
      pickedUnits.pop();

      if (results.length >= limit) return;
    }
  }

  search(0, quota, { ...remainingTargets }, []);
  return shuffle(results);
}

function generateDisciplineSizeOnlyCombos(units, quota, limit = 240) {
  const candidates = shuffle(units).sort(
    (left, right) => right.size - left.size || left.id.localeCompare(right.id),
  );
  const results = [];

  function search(startIndex, remainingSize, pickedUnits) {
    if (!remainingSize) {
      results.push({ units: [...pickedUnits] });
      return;
    }
    if (results.length >= limit || startIndex >= candidates.length) return;

    for (let index = startIndex; index < candidates.length; index += 1) {
      const unit = candidates[index];
      if (unit.size > remainingSize) continue;
      pickedUnits.push(unit);
      search(index + 1, remainingSize - unit.size, pickedUnits);
      pickedUnits.pop();
      if (results.length >= limit) return;
    }
  }

  search(0, quota, []);
  return shuffle(results);
}

function priorityDistance(priorities, targets) {
  return (
    Math.abs((priorities.alta || 0) - (targets.alta || 0)) +
    Math.abs((priorities.media || 0) - (targets.media || 0)) +
    Math.abs((priorities.baixa || 0) - (targets.baixa || 0))
  );
}

function flattenSelectedUnits(selectedUnits) {
  const orderedUnits = shuffle(selectedUnits);
  const orderedQuestions = [];
  let order = 1;

  for (const unit of orderedUnits) {
    for (const question of unit.questions) {
      orderedQuestions.push({
        order,
        ...buildQuestionView(question, unit),
      });
      order += 1;
    }
  }

  return orderedQuestions;
}

function buildAllocationSummary(discipline, units) {
  return {
    discipline,
    alta: units.reduce((sum, unit) => sum + (unit.priorities.alta || 0), 0),
    media: units.reduce((sum, unit) => sum + (unit.priorities.media || 0), 0),
    baixa: units.reduce((sum, unit) => sum + (unit.priorities.baixa || 0), 0),
    blocks: units.map((unit) => unit.id),
    questions: units.reduce((sum, unit) => sum + unit.size, 0),
  };
}

function buildSimulation(questions, template, targets, type) {
  const validQuestions = ensureCompleteQuestions(questions);
  const units = buildSimulationUnits(validQuestions);
  const disciplines = Object.keys(template);
  const unitsByDiscipline = Object.fromEntries(
    disciplines.map((discipline) => [
      discipline,
      units.filter((unit) => normalizeText(unit.discipline) === normalizeText(discipline)),
    ]),
  );
  const deadEnds = new Set();

  function search(disciplineIndex, remainingTargets) {
    if (disciplineIndex >= disciplines.length) {
      return remainingTargets.alta === 0 &&
        remainingTargets.media === 0 &&
        remainingTargets.baixa === 0
        ? []
        : null;
    }

    const discipline = disciplines[disciplineIndex];
    const key = `${disciplineIndex}:${remainingTargets.alta}:${remainingTargets.media}:${remainingTargets.baixa}`;
    if (deadEnds.has(key)) return null;

    const quota = template[discipline];
    const combinations = generateDisciplineCombos(
      unitsByDiscipline[discipline],
      quota,
      remainingTargets,
    );

    if (!combinations.length) {
      deadEnds.add(key);
      return null;
    }

    for (const combination of combinations) {
      const nextRemaining = subtractPriorityCounts(remainingTargets, combination.priorities);
      const result = search(disciplineIndex + 1, nextRemaining);
      if (result) {
        return [{ discipline, units: combination.units }, ...result];
      }
    }

    deadEnds.add(key);
    return null;
  }

  const selectedByDiscipline = search(0, { ...targets });
  if (!selectedByDiscipline) {
    throw new Error("Nao foi possivel montar um simulado com os blocos de apoio necessarios.");
  }

  const selectedUnits = selectedByDiscipline.flatMap((item) => item.units);
  const orderedQuestions = flattenSelectedUnits(selectedUnits);

  return {
    type,
    total: orderedQuestions.length,
    generatedAt: new Date().toISOString(),
    disciplines: countBy(orderedQuestions, (question) => question.discipline),
    priorities: countBy(orderedQuestions, (question) => question.prioridade),
    allocation: selectedByDiscipline.map((item) =>
      buildAllocationSummary(item.discipline, item.units),
    ),
    blocks: selectedUnits.map((unit) => ({
      id: unit.id,
      discipline: unit.discipline,
      kind: unit.kind,
      size: unit.size,
      questionIds: unit.questions.map((question) => question.id),
    })),
    questions: orderedQuestions,
  };
}

export function gerarSimuladoRapido(questions) {
  return buildSimulation(questions, QUICK_TEMPLATE, PRIORITY_TARGETS.rapido, "simulado-rapido");
}

export function gerarSimuladoMedio(questions, options = {}) {
  const templateIndex = Number.isInteger(options.templateIndex) ? options.templateIndex : 0;
  const template = MEDIUM_TEMPLATES[Math.abs(templateIndex) % MEDIUM_TEMPLATES.length];
  return buildSimulation(questions, template, PRIORITY_TARGETS.medio, "simulado-medio");
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
  const units = buildSimulationUnits(
    validQuestions.filter(
      (question) =>
        normalizeText(question.discipline) === normalizeText(normalizedDiscipline),
    ),
  );

  if (!units.length) {
    throw new Error(`Disciplina invalida ou sem questoes completas: ${disciplina}`);
  }

  const combinations = generateDisciplineCombos(
    units,
    10,
    PRIORITY_TARGETS.treino,
  );
  let selectedUnits = combinations[0]?.units || null;
  if (!selectedUnits) {
    const relaxedCombinations = generateDisciplineSizeOnlyCombos(units, 10);
    if (!relaxedCombinations.length) {
      throw new Error("Nao foi possivel montar este treino com os blocos de apoio necessarios.");
    }
    relaxedCombinations.sort((left, right) => {
      const leftSummary = buildAllocationSummary(normalizedDiscipline, left.units);
      const rightSummary = buildAllocationSummary(normalizedDiscipline, right.units);
      return (
        priorityDistance(leftSummary, PRIORITY_TARGETS.treino) -
          priorityDistance(rightSummary, PRIORITY_TARGETS.treino) ||
        left.units.length - right.units.length
      );
    });
    selectedUnits = relaxedCombinations[0].units;
  }
  const orderedQuestions = flattenSelectedUnits(selectedUnits);

  return {
    type: "treino-por-disciplina",
    total: orderedQuestions.length,
    generatedAt: new Date().toISOString(),
    discipline: normalizedDiscipline,
    priorities: countBy(orderedQuestions, (question) => question.prioridade),
    allocation: [buildAllocationSummary(normalizedDiscipline, selectedUnits)],
    blocks: selectedUnits.map((unit) => ({
      id: unit.id,
      discipline: unit.discipline,
      kind: unit.kind,
      size: unit.size,
      questionIds: unit.questions.map((question) => question.id),
    })),
    questions: orderedQuestions,
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
