from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import unicodedata
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = Path(r"G:\Meu Drive\PROVAS DO IFF_PROF. PAULO ALEXANDRE")
EDITAL_PATH = Path(
    r"C:\Users\Desktop\Downloads\EDITAL+79-2025+-+IFFLU,+DE+11+DE+AGOSTO+DE+2025.pdf"
)

PDF_DIR = ROOT / "assets" / "pdfs"
IMAGE_DIR = ROOT / "assets" / "question-images"
DATA_DIR = ROOT / "data"

DISCIPLINE_RANGES = [
    (1, 10, "Língua Portuguesa", "Linguagens e Códigos"),
    (11, 20, "Matemática", "Ciências da Natureza e Matemática"),
    (21, 30, "Ciências Naturais", "Ciências da Natureza e Matemática"),
    (31, 35, "História", "Ciências Humanas"),
    (36, 40, "Geografia", "Ciências Humanas"),
]

SKIP_QUESTION_MARKERS = [
    "NOSSOS CAMPI",
    "Endereços dos campi",
    "Endereços dos Campi",
    "Gabarito Final",
    "GABARITO FINAL",
    "Gabarito após",
    "Gabarito do Processo",
    "MINISTÉRIO DA EDUCAÇÃO",
]

ALTERNATIVE_RE = re.compile(r"^\s*([A-Ea-e])\)\s*(.+)?$")
EXPECTED_ALTERNATIVE_LETTERS = ["A", "B", "C", "D", "E"]

HEADER_NOISE_MARKERS = [
    "Instituto Federal Fluminense",
    "PRÓ-REITORIA DE ENSINO",
    "PRÓ-REITORIA DE ENSINO – COMISSÃO DE PROCESSOS SELETIVOS",
    "COMISSÃO DE PROCESSOS SELETIVOS",
]

REFERENCE_MARKERS = [
    "fonte:",
    "disponivel em:",
    "acesso em:",
    "fragmento.",
    "adaptado.",
    "elaboracao propria",
    "apud",
]

ALTERNATIVE_BLEED_MARKERS = [
    r"\butilize o texto a seguir para responder\b",
    r"\bleia o texto a seguir para responder\b",
    r"\btexto\s+[ivxlcdm]+\b",
    r"\bcharge\s*\d+\b",
    r"\binstituto federal fluminense\b",
    r"\bpro-reitoria de ensino\b",
    r"\bcomissao de processos seletivos\b",
    r"\bdisponivel em:\b",
    r"\bacesso em:\b",
    r"\bfonte:\b",
    r"\bedital\s*n\b",
    r"\bcursos\s+tecnicos\s+integr",
    r"\bcursos\s+tecnicos\s+concomit",
]

ALTERNATIVE_BLEED_MARKERS_RAW = [
    r"\bUtilize o texto a seguir para responder\b",
    r"\bLeia o texto a seguir para responder\b",
    r"\bTexto\s+[IVXLCDM]+\b",
    r"\bCharge\s*\d+\b",
    r"\bInstituto Federal Fluminense\b",
    r"\bPR[ÓO]-REITORIA DE ENSINO\b",
    r"\bCOMISS[ÃA]O DE PROCESSOS SELETIVOS\b",
    r"\bDispon[ií]vel em:\b",
    r"\bAcesso em:\b",
    r"\bFonte:\b",
    r"\bEdital\s*n[ºo°.]?\s*\d+",
    r"\bCursos\s+T[eé]cnicos\s+Integrados\b",
    r"\bCursos\s+T[eé]cnicos\s+Concomitantes\b",
    r"\bCurs\w*\s+T[eé]cnic\w*\s+Integrad\s*os\b",
    r"\bCurs\w*\s+T[eé]cnic\w*\s+Concomit\s*antes\b",
    r"\bEdit\s*al\s*n[ºo°.]?\s*\d+",
]

STATEMENT_NOISE_PATTERNS = [
    r"\butilize o texto a seguir para responder\b",
    r"\bleia o texto a seguir para responder\b",
    r"\binstituto\s+fed\s*eral\s+fluminense\b",
    r"\bpro-?reitoria\s+de\s+ensino\b",
    r"\bcomissao\s+de\s+processos\s+seletivos\b",
    r"\bedital\s*n[ºo°.]?\s*\d+",
]

QUESTION_TAIL_MARKERS = [
    r"\bassinale\b",
    r"\bindique\b",
    r"\bidentifique\b",
    r"\bmarque\b",
    r"\bqual\b",
    r"\bquais\b",
    r"\bcom base\b",
    r"\bconsiderando\b",
    r"\bdentre\b",
    r"\bsabendo\b",
    r"\bimagine\b",
    r"\bobserve\b",
    r"\banalise\b",
    r"\bleia\b",
    r"\ba partir\b",
    r"\bem relacao\b",
    r"\bde acordo com\b",
    r"\bpode[- ]?se afirmar\b",
    r"\be correto afirmar\b",
    r"\best[aã]o?\b.*\bcorret",
    r"\bnao ocorre\b",
    r"\bexceto\b",
    r"\brefere-se\b",
    r"\bo efeito\b",
    r"\bo numero\b",
    r"\bo volume\b",
    r"\ba medida\b",
    r"\bvaria de\b",
]

SUPPORT_TYPE_RULES = [
    ("gráfico", [r"\bgrafico\b"]),
    ("tabela", [r"\btabela\b", r"\bquadro\b"]),
    ("mapa", [r"\bmapa\b", r"\bcartograf"]),
    ("tirinha", [r"\btirinha\b", r"\bcharge\b", r"\bhq\b"]),
    ("poema", [r"\bpoema\b", r"\bpoesia\b", r"\bverso\b"]),
    ("texto", [r"\btexto\s+[ivxlcdm]+\b", r"\bfragmento\b", r"\bleia o texto\b"]),
]

STARTER_RESOLUTIONS = {
    "2025-01": {
        "status": "publicada",
        "title": "Finalidade do texto",
        "answer": "D",
        "steps": [
            "A pergunta pede a finalidade global do Texto I.",
            "O texto apresenta a Terapia Assistida por Animais, informa seus benefícios e mostra como o projeto funciona.",
            "Como não há objetivo de vender, comparar tratamentos ou cuidar dos animais, a alternativa correta é a que indica informação sobre tratamento terapêutico com animais.",
        ],
    },
    "2025-02": {
        "status": "publicada",
        "title": "Efeito do diminutivo",
        "answer": "A",
        "steps": [
            "O diminutivo em 'bichinhos' não indica tamanho nem agressividade.",
            "No contexto, a palavra aproxima o leitor dos animais e marca carinho.",
            "Esse efeito expressivo corresponde à relação de afetividade.",
        ],
    },
    "2025-03": {
        "status": "publicada",
        "title": "Característica dos animais do projeto",
        "answer": "D",
        "steps": [
            "O texto afirma que o projeto reúne adestradores, veterinários, fisioterapeutas, psicólogos, terapeutas ocupacionais e fonoaudiólogos.",
            "Também esclarece que os animais facilitam o trabalho das equipes de saúde e dependem do comando humano.",
            "Logo, a característica adequada é trabalhar em conjunto com profissionais de saúde.",
        ],
    },
}


def slugify(value: str, limit: int = 120) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_value = re.sub(r"[^A-Za-z0-9]+", "-", ascii_value).strip("-").lower()
    return ascii_value[:limit].strip("-") or "arquivo"


def year_from_name(name: str) -> int | None:
    match = re.search(r"(20\d{2}|201\d)", name)
    return int(match.group(1)) if match else None


def classify_source(name: str) -> str:
    upper = name.upper()
    if "EDITAL" in upper:
        return "edital"
    if "GABARITO" in upper and "PROVA+E+GABARITO" not in upper:
        return "gabarito"
    if "GABARITO" in upper and "PROVA" in upper:
        return "prova-gabarito"
    return "prova"


def copy_pdf(src: Path) -> str:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    try:
        if src.resolve().parent == PDF_DIR.resolve():
            return src.relative_to(ROOT).as_posix()
    except Exception:
        pass
    year = year_from_name(src.name)
    prefix = f"{year}-" if year else ""
    dst_name = f"{prefix}{slugify(src.stem)}.pdf"
    dst = PDF_DIR / dst_name
    if not dst.exists() or dst.stat().st_size != src.stat().st_size:
        shutil.copy2(src, dst)
    return dst.relative_to(ROOT).as_posix()


def read_pdf_pages(path: Path) -> tuple[list[str], int]:
    try:
        reader = PdfReader(str(path))
        pages = [(page.extract_text() or "") for page in reader.pages]
        return pages, len(reader.pages)
    except Exception as exc:  # noqa: BLE001 - report and keep the build going
        print(f"PDF read failed: {path.name}: {exc}")
        return [], 0


def discipline_for_number(number: int) -> tuple[str, str]:
    for start, end, discipline, area in DISCIPLINE_RANGES:
        if start <= number <= end:
            return discipline, area
    return "Geral", "Geral"


def clean_question_text(text: str) -> str:
    for marker in SKIP_QUESTION_MARKERS:
        index = text.find(marker)
        if index > 0:
            text = text[:index]

    clean_lines: list[str] = []
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            clean_lines.append("")
            continue
        if re.fullmatch(r"\d{1,2}", line):
            continue
        if "Processo Seletivo para Ingresso" in line:
            continue
        if any(marker in line for marker in HEADER_NOISE_MARKERS):
            continue
        if is_header_noise_line(line):
            continue
        if re.match(r"edital\s*n", normalize_search_text(line)):
            continue
        if line.startswith("Edital Nº") or line.startswith("Edital N.º"):
            continue
        if "Cursos Técnicos Integrados" in line and len(line) < 90:
            continue
        clean_lines.append(line)

    compact = "\n".join(clean_lines)
    compact = re.sub(r"\n{3,}", "\n\n", compact).strip()
    return compact


def normalize_search_text(*parts: object) -> str:
    merged = " ".join(str(part or "") for part in parts)
    normalized = unicodedata.normalize("NFKD", merged)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", ascii_text).strip().lower()


def split_paragraphs(text: str) -> list[str]:
    paragraphs = [
        re.sub(r"\s+", " ", block).strip()
        for block in re.split(r"\n\s*\n", text.strip())
        if re.sub(r"\s+", " ", block).strip()
    ]
    return paragraphs


def is_header_noise_line(text: str) -> bool:
    normalized = normalize_search_text(text)
    return bool(
        re.search(r"instituto\s+fed\s*eral\s+fluminense", normalized)
        or re.search(r"pro-?reitoria\s+de\s+ensino", normalized)
        or re.search(r"comissao\s+de\s+processos\s+seletivos", normalized)
        or re.search(r"processo\s+seletivo\s+\d{4}", normalized)
    )


def contains_reference_marker(text: str) -> bool:
    normalized = normalize_search_text(text)
    return any(marker in normalized for marker in REFERENCE_MARKERS)


def is_reference_paragraph(text: str) -> bool:
    normalized = normalize_search_text(text)
    if not normalized:
        return False
    if contains_reference_marker(normalized):
        return True
    citation_like = re.match(
        r"^[a-z][a-z\s.,;:-]{0,120}\d{4}.*(?:fragmento|adaptado| p\.| ed\.)",
        normalized,
    )
    return bool(citation_like)


def contains_bleed_marker(text: str) -> bool:
    normalized = normalize_search_text(text)
    return any(re.search(pattern, normalized) for pattern in ALTERNATIVE_BLEED_MARKERS)


def trim_alternative_noise(text: str) -> str:
    cut_positions = []
    for pattern in ALTERNATIVE_BLEED_MARKERS_RAW:
        match = re.search(pattern, text, flags=re.I)
        if match:
            cut_positions.append(match.start())
    for pattern in [
        r"Instituto\s+Fed\s*eral\s+Fluminense",
        r"PR[ÓO]-?\s*REITORIA\s+DE\s+ENSINO",
        r"COMISS[ÃA]O\s+DE\s+PROCESSOS\s+SELETIVOS",
    ]:
        match = re.search(pattern, text, flags=re.I)
        if match:
            cut_positions.append(match.start())
    if cut_positions:
        cut_at = min(cut_positions)
        text = text[:cut_at]
    text = re.sub(r"\s+", " ", text).strip(" -–—:;")
    return text


def is_question_tail_paragraph(text: str) -> bool:
    normalized = normalize_search_text(text)
    if not normalized:
        return False
    return any(re.search(pattern, normalized) for pattern in QUESTION_TAIL_MARKERS)


def structure_question_prompt(prompt: str) -> dict[str, object]:
    if not prompt.strip():
        return {
            "statement": "",
            "textoApoio": "",
            "fonteReferencia": [],
        }

    paragraphs = split_paragraphs(prompt)
    references = [paragraph for paragraph in paragraphs if is_reference_paragraph(paragraph)]
    content_paragraphs = [
        paragraph for paragraph in paragraphs if paragraph not in references
    ]

    if not content_paragraphs:
        return {
            "statement": prompt.strip(),
            "textoApoio": "",
            "fonteReferencia": references,
        }

    statement_start = len(content_paragraphs) - 1
    while statement_start > 0 and is_question_tail_paragraph(
        content_paragraphs[statement_start - 1]
    ):
        statement_start -= 1

    statement_parts = content_paragraphs[statement_start:]
    support_parts = content_paragraphs[:statement_start]

    statement = "\n\n".join(statement_parts).strip()
    texto_apoio = "\n\n".join(support_parts).strip()

    if not statement and texto_apoio:
        statement = texto_apoio
        texto_apoio = ""

    return {
        "statement": statement,
        "textoApoio": texto_apoio,
        "fonteReferencia": references,
    }


def infer_support_types(
    texto_apoio: str,
    statement: str,
    references: list[str],
    image_count: int,
) -> list[str]:
    combined = normalize_search_text(texto_apoio, statement, " ".join(references))
    detected: list[str] = []
    if texto_apoio.strip():
        detected.append("texto de apoio")
    if image_count:
        detected.append("imagem")
    for label, patterns in SUPPORT_TYPE_RULES:
        if any(re.search(pattern, combined) for pattern in patterns) and label not in detected:
            detected.append(label)
    return detected


def manual_review_reasons(question: dict[str, object]) -> list[str]:
    reasons: list[str] = []
    statement = str(question.get("statement") or "")
    support_text = str(question.get("textoApoio") or "")
    alternatives = question.get("alternatives") or []

    normalized_statement = normalize_search_text(statement)
    if any(re.search(pattern, normalized_statement) for pattern in STATEMENT_NOISE_PATTERNS):
        reasons.append("enunciado_com_ruido")
    if contains_reference_marker(support_text):
        reasons.append("apoio_com_fonte_misturada")

    for alternative in alternatives:
        text = str(alternative.get("text") or "")
        if contains_bleed_marker(text) or contains_reference_marker(text):
            reasons.append("alternativa_com_texto_estranho")
            break

    unique_reasons = []
    for reason in reasons:
        if reason not in unique_reasons:
            unique_reasons.append(reason)
    return unique_reasons


def matches_any_rule(text: str, patterns: list[str]) -> bool:
    return any(re.search(pattern, text) for pattern in patterns)


def infer_math_content_summary(text: str) -> str:
    rules = [
        ("Gráficos e tabelas", [r"\bgrafico\b", r"\btabela\b", r"\bpesquisa\b", r"\bsetor\b"]),
        ("Probabilidade", [r"\bprobabilidade\b", r"\bao acaso\b", r"\bsorteio\b"]),
        ("Combinatória", [r"\bcombin", r"\barranjo\b", r"\bpermut", r"\bpossibilidades?\b"]),
        ("Funções", [r"\bfuncao\b", r"\blucro\b", r"\breceita\b", r"\bparabola\b"]),
        (
            "Volume e capacidade",
            [
                r"\bvolume\b",
                r"\bcapacidade\b",
                r"\bcilindr",
                r"\bcubo\b",
                r"\bprisma\b",
                r"\bpiscina\b",
                r"\bcaixa\b",
            ],
        ),
        (
            "Pitágoras",
            [r"\bpitagoras\b", r"\bhipotenusa\b", r"\bcatetos?\b", r"\btriangulo retang"],
        ),
        (
            "Polígonos e ângulos",
            [
                r"\bpoligono\b",
                r"\bdiagonais?\b",
                r"\bhexagono\b",
                r"\bpentagono\b",
                r"\btriacontagono\b",
                r"\bangulo interno\b",
                r"\bangulo externo\b",
            ],
        ),
        (
            "Área e perímetro",
            [
                r"\barea\b",
                r"\bperimetro\b",
                r"\bfigura composta\b",
                r"\bmalha\b",
                r"\bterreno\b",
                r"\bjardim\b",
                r"\bhorta\b",
                r"\bchapa\b",
                r"\bteto\b",
                r"\bparedes?\b",
            ],
        ),
        (
            "Razão e proporção",
            [
                r"\brazao\b",
                r"\bpropor",
                r"\bdiretamente proporcion",
                r"\binversamente proporcion",
                r"\bmedia\b",
                r"\bdesconto\b",
                r"\baumento\b",
                r"\bporcent",
            ],
        ),
        (
            "Grandezas e medidas",
            [
                r"\bcentilitro\b",
                r"\bmililitro\b",
                r"\blitro\b",
                r"\bpolegadas?\b",
                r"\bpolegada\b",
                r"\bconvers",
                r"\bunidade\b",
            ],
        ),
        (
            "Equações e álgebra",
            [
                r"\bequacao\b",
                r"\bsistema\b",
                r"\bexpress",
                r"\bradical\b",
                r"\bbhaskara\b",
                r"\bnotacao cientifica\b",
                r"\braiz real\b",
                r"\bpotencia\b",
            ],
        ),
    ]
    for label, patterns in rules:
        if matches_any_rule(text, patterns):
            return label
    return "Resolução de problemas"


def infer_portuguese_content_summary(text: str) -> str:
    rules = [
        (
            "Gramática e ortografia",
            [
                r"\bcrase\b",
                r"\bacentu",
                r"\bortograf",
                r"\bpontua",
                r"\bconcord",
                r"\bregencia\b",
                r"\bverbo\b",
                r"\bsubstantivo\b",
                r"\badjetivo\b",
                r"\bpronome\b",
            ],
        ),
        (
            "Coesão textual",
            [r"\bcoes", r"\bconectiv", r"\breferencia\b", r"\bretoma\b", r"\bsequencia textual\b"],
        ),
        (
            "Sentido das palavras",
            [r"\bironia\b", r"\bhumor\b", r"\bmetafor", r"\bsentido\b", r"\befeito de sentido\b"],
        ),
        (
            "Gêneros textuais",
            [r"\bgenero\b", r"\bcharge\b", r"\btirinha\b", r"\banuncio\b", r"\bcartaz\b", r"\breportagem\b"],
        ),
    ]
    for label, patterns in rules:
        if matches_any_rule(text, patterns):
            return label
    return "Interpretação de texto"


def infer_science_content_summary(text: str) -> str:
    rules = [
        (
            "Ecologia e meio ambiente",
            [r"\becologia\b", r"\bbioma\b", r"\bmeio ambiente\b", r"\bcadeia alimentar\b", r"\bpolui", r"\bsustent"],
        ),
        (
            "Corpo humano e saúde",
            [r"\bcorpo humano\b", r"\bsaude\b", r"\bvirus\b", r"\bbacteria\b", r"\bvacina\b", r"\bsistema\b", r"\bsangue\b"],
        ),
        (
            "Química do cotidiano",
            [r"\batomo\b", r"\bquimic", r"\breacao\b", r"\bsubstancia\b", r"\bmistura\b", r"\bsolucao\b", r"\belemento quimico\b"],
        ),
        (
            "Física do cotidiano",
            [r"\bforca\b", r"\benergia\b", r"\bvelocidade\b", r"\bmovimento\b", r"\beletric", r"\bluz\b", r"\bsom\b", r"\btemperatura\b"],
        ),
        ("Genética", [r"\bgenet", r"\bdna\b", r"\bhereditar"]),
        ("Astronomia", [r"\bplaneta\b", r"\bsistema solar\b", r"\bterra\b", r"\blua\b", r"\bastron"]),
    ]
    for label, patterns in rules:
        if matches_any_rule(text, patterns):
            return label
    return "Ciências da natureza"


def infer_history_content_summary(text: str) -> str:
    rules = [
        ("Ditadura militar", [r"\bditadura\b", r"\bai-5\b", r"\bato institucional\b", r"\bregime militar\b"]),
        (
            "História do Brasil",
            [r"\bcolonia\b", r"\bimperio\b", r"\bindependencia\b", r"\bescrav", r"\brepublica\b", r"\bvargas\b", r"\bbrasil\b"],
        ),
        (
            "História geral",
            [r"\brevolu", r"\bguerra\b", r"\beuropa\b", r"\bgrecia\b", r"\broma\b", r"\bidade media\b", r"\brenascimento\b"],
        ),
        ("Sociedade e cidadania", [r"\bcidadania\b", r"\bdireitos?\b", r"\bmovimentos sociais\b", r"\btrabalho\b"]),
    ]
    for label, patterns in rules:
        if matches_any_rule(text, patterns):
            return label
    return "Contexto histórico"


def infer_geography_content_summary(text: str) -> str:
    rules = [
        ("Cartografia", [r"\bmapa\b", r"\bcartograf", r"\blatitude\b", r"\blongitude\b", r"\bescala\b", r"\bfuso"]),
        ("Clima", [r"\bclima\b", r"\btemperatura\b", r"\bchuva\b", r"\bseca\b", r"\bmassa de ar\b"]),
        ("Relevo e solo", [r"\brelevo\b", r"\bsolo\b", r"\beros", r"\brocha\b"]),
        ("População e urbanização", [r"\bpopul", r"\bdemograf", r"\bmigra", r"\burban"]),
        ("Meio ambiente", [r"\bbioma\b", r"\bvegeta", r"\bfloresta\b", r"\bimpacto ambiental\b", r"\bsustent"]),
        ("Espaço econômico", [r"\bindustr", r"\bagro", r"\beconomia\b", r"\bcomercio\b", r"\bglobaliza"]),
    ]
    for label, patterns in rules:
        if matches_any_rule(text, patterns):
            return label
    return "Espaço geográfico"


def infer_content_summary(
    discipline: str,
    statement: str,
    resolution: dict[str, object],
    descriptor_details: list[dict[str, object]],
) -> str:
    text = normalize_search_text(
        statement,
        resolution.get("texto"),
        " ".join(str(item) for item in resolution.get("passos") or []),
        " ".join(str(item.get("description") or "") for item in descriptor_details),
        " ".join(str(item.get("topic") or "") for item in descriptor_details),
    )

    if discipline == "Matemática":
        return infer_math_content_summary(text)
    if discipline == "Língua Portuguesa":
        return infer_portuguese_content_summary(text)
    if discipline == "Ciências Naturais":
        return infer_science_content_summary(text)
    if discipline == "História":
        return infer_history_content_summary(text)
    if discipline == "Geografia":
        return infer_geography_content_summary(text)
    return "Conteúdo em revisão"


def infer_question_priority(
    discipline: str,
    content_summary: str,
    statement: str,
    resolution: dict[str, object],
) -> str:
    text = normalize_search_text(
        statement,
        resolution.get("texto"),
        " ".join(str(item) for item in resolution.get("passos") or []),
    )

    if discipline == "Matemática":
        if content_summary in {
            "Gráficos e tabelas",
            "Probabilidade",
            "Área e perímetro",
            "Polígonos e ângulos",
        }:
            return "alta"
        if content_summary in {
            "Volume e capacidade",
            "Pitágoras",
            "Razão e proporção",
            "Equações e álgebra",
            "Funções",
            "Grandezas e medidas",
            "Resolução de problemas",
        }:
            return "media"
        if content_summary == "Combinatória":
            return "baixa"
        return "media"

    if discipline == "Língua Portuguesa":
        if content_summary == "Interpretação de texto":
            return "alta"
        if content_summary in {
            "Coesão textual",
            "Gramática e ortografia",
            "Sentido das palavras",
        }:
            return "media"
        if content_summary == "Gêneros textuais":
            return "baixa"
        return "media"

    if discipline == "Ciências Naturais":
        if content_summary in {
            "Corpo humano e saúde",
            "Química do cotidiano",
            "Física do cotidiano",
        }:
            return "alta"
        if content_summary == "Astronomia":
            return "baixa"
        if content_summary == "Ecologia e meio ambiente":
            return "media"
        if content_summary == "Ciências da natureza":
            if matches_any_rule(
                text,
                [
                    r"\bcelul",
                    r"\bmembrana\b",
                    r"\borganel",
                    r"\blisossom",
                    r"\btecido\b",
                    r"\bsistema\b",
                    r"\bferment",
                    r"\bdensidade\b",
                    r"\bmistura\b",
                    r"\bsubstanc",
                ],
            ):
                return "alta"
            if matches_any_rule(
                text,
                [
                    r"\becolog",
                    r"\bambiente\b",
                    r"\bagua\b",
                    r"\bsolo\b",
                    r"\bpolui",
                    r"\bcadeia alimentar\b",
                    r"\bpreda",
                    r"\bparasit",
                    r"\bbioma\b",
                ],
            ):
                return "media"
            return "media"
        return "media"

    if discipline == "História":
        if content_summary == "Ditadura militar":
            return "alta"
        if content_summary == "História do Brasil":
            if matches_any_rule(
                text,
                [
                    r"\bescrav",
                    r"\bcoloni",
                    r"\bcapitania",
                    r"\bcamara municipal",
                    r"\bhomens bons\b",
                    r"\bindigen",
                ],
            ):
                return "media"
            return "alta"
        if content_summary in {"História geral", "Contexto histórico"}:
            if matches_any_rule(
                text,
                [
                    r"\bcolonial",
                    r"\bcolonialismo\b",
                    r"\bneocolonial",
                    r"\bescrav",
                ],
            ):
                return "media"
            return "alta"
        if content_summary == "Sociedade e cidadania":
            return "baixa"
        return "baixa"

    if discipline == "Geografia":
        if content_summary in {"Cartografia", "Espaço econômico"}:
            return "alta"
        if content_summary in {"População e urbanização", "Clima", "Meio ambiente"}:
            return "media"
        if content_summary == "Espaço geográfico":
            if matches_any_rule(
                text,
                [
                    r"\bpontos cardeais\b",
                    r"\brosa dos ventos\b",
                    r"\bmapa\b",
                    r"\bescala\b",
                    r"\bfuso\b",
                    r"\blatitude\b",
                    r"\blongitude\b",
                    r"\bglobaliza",
                    r"\brede",
                    r"\binternet\b",
                    r"\benergia renovavel\b",
                    r"\bfonte renovavel\b",
                ],
            ):
                return "alta"
            if matches_any_rule(
                text,
                [
                    r"\bidh\b",
                    r"\bpopul",
                    r"\bdemograf",
                    r"\burban",
                    r"\bclima\b",
                    r"\bbioma\b",
                    r"\bsemiarido\b",
                    r"\bcaatinga\b",
                    r"\btempo atmosferico\b",
                ],
            ):
                return "media"
            return "baixa"
        return "baixa"

    return "media"


def split_statement_and_alternatives(text: str) -> tuple[str, str, list[dict[str, str]]]:
    raw = text.strip()
    raw = re.sub(r"^QUEST\S*\s*0*([1-9]|[1-3]\d|40)\b\s*", "", raw, flags=re.I).strip()
    if not raw:
        return "", "", []

    raw_lines = raw.splitlines()
    alternatives: list[dict[str, str] | dict[str, int]] = []
    current_alternative: dict[str, str] | None = None
    current_start_line: int | None = None

    for line_index, raw_line in enumerate(raw_lines):
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            if current_alternative and current_alternative["text"]:
                current_alternative["text"] = f"{current_alternative['text']}\n".strip()
            continue

        match = ALTERNATIVE_RE.match(line)
        if match:
            if current_alternative:
                current_alternative["text"] = current_alternative["text"].strip()
                alternatives.append(
                    {
                        **current_alternative,
                        "start_line": current_start_line or 0,
                    }
                )
            current_alternative = {
                "letter": match.group(1).upper(),
                "text": (match.group(2) or "").strip(),
            }
            current_start_line = line_index
            continue

        if current_alternative:
            separator = "" if current_alternative["text"].endswith("\n") else " "
            current_alternative["text"] = (
                f"{current_alternative['text']}{separator}{line}".strip()
            )

    if current_alternative:
        current_alternative["text"] = current_alternative["text"].strip()
        alternatives.append(
            {
                **current_alternative,
                "start_line": current_start_line or 0,
            }
        )

    parsed_alternatives = [
        {
            "letter": str(item.get("letter") or "").strip().upper(),
            "text": str(item.get("text") or "").strip(),
            "start_line": int(item.get("start_line") or 0),
        }
        for item in alternatives
    ]

    selected_alternatives = parsed_alternatives
    for index in range(len(parsed_alternatives) - 5, -1, -1):
        window = parsed_alternatives[index : index + 5]
        if [item["letter"] for item in window] == EXPECTED_ALTERNATIVE_LETTERS:
            selected_alternatives = window
            break

    compact_prompt_lines: list[str] = []
    prompt_source = (
        raw_lines[: selected_alternatives[0]["start_line"]]
        if selected_alternatives
        else raw_lines
    )
    for raw_line in prompt_source:
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            if compact_prompt_lines and compact_prompt_lines[-1] != "":
                compact_prompt_lines.append("")
            continue
        compact_prompt_lines.append(line)

    prompt = "\n".join(compact_prompt_lines).strip()
    prompt = re.sub(r"\n{3,}", "\n\n", prompt)
    cleaned_alternatives = [
        {"letter": item["letter"], "text": trim_alternative_noise(item["text"])}
        for item in selected_alternatives
    ]
    cleaned_alternatives = [
        item for item in cleaned_alternatives if item["letter"] and item["text"]
    ]
    if len(cleaned_alternatives) < 2:
        return raw, raw, []
    return prompt, raw, cleaned_alternatives


def ensure_resolutions_file() -> Path:
    resolutions_path = DATA_DIR / "resolutions.json"
    if not resolutions_path.exists():
        resolutions_path.write_text(
            json.dumps(STARTER_RESOLUTIONS, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return resolutions_path


def load_resolutions_source() -> dict[str, dict[str, object]]:
    resolutions_path = ensure_resolutions_file()
    try:
        return json.loads(resolutions_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def normalize_resolution(raw_resolution: dict[str, object] | None) -> dict[str, object]:
    if not raw_resolution:
        return {"texto": ""}

    if isinstance(raw_resolution.get("resolution"), dict):
        nested = raw_resolution.get("resolution") or {}
        texto = str(nested.get("texto") or "").strip()
        passos = [
            str(item).strip()
            for item in (nested.get("passos") or [])
            if str(item).strip()
        ]
    else:
        texto = str(raw_resolution.get("text") or raw_resolution.get("texto") or "").strip()
        passos = [
            str(item).strip()
            for item in (raw_resolution.get("steps") or raw_resolution.get("passos") or [])
            if str(item).strip()
        ]

    normalized: dict[str, object] = {"texto": texto}
    if passos:
        normalized["passos"] = passos
    return normalized


def has_resolution_content(resolution: dict[str, object]) -> bool:
    return bool(str(resolution.get("texto") or "").strip() or resolution.get("passos"))


def question_status(
    answer: str | None,
    descriptor_codes: list[str],
    statement: str,
    alternatives: list[dict[str, str]],
    resolution: dict[str, object],
) -> str:
    if not answer:
        return "sem_gabarito"
    if not has_resolution_content(resolution):
        return "sem_resolucao"
    if not statement or len(alternatives) < 2 or not descriptor_codes:
        return "revisar"
    return "completa"


def is_valid_complete_question(
    answer: str | None,
    statement: str,
    alternatives: list[dict[str, str]],
) -> bool:
    normalized_answer = str(answer or "").strip().upper()
    letters = [
        str(alternative.get("letter") or "").strip().upper()
        for alternative in alternatives
    ]
    return (
        bool(statement.strip())
        and len(alternatives) == 5
        and letters == EXPECTED_ALTERNATIVE_LETTERS
        and normalized_answer in letters
    )


def extract_questions(pages: list[str]) -> dict[int, dict[str, object]]:
    full_text = ""
    page_offsets: list[int] = []
    for page_text in pages:
        page_offsets.append(len(full_text))
        full_text += page_text + "\n\n"

    question_re = re.compile(r"\bQUEST\S*\s*0*([1-9]|[1-3]\d|40)\b")
    matches = [m for m in question_re.finditer(full_text)]
    matches = [m for m in matches if 1 <= int(m.group(1)) <= 40]
    matches.sort(key=lambda item: item.start())

    by_number: dict[int, re.Match[str]] = {}
    for match in matches:
        number = int(match.group(1))
        by_number.setdefault(number, match)

    ordered = sorted(by_number.items(), key=lambda item: item[1].start())
    questions: dict[int, dict[str, object]] = {}
    for index, (number, match) in enumerate(ordered):
        end = ordered[index + 1][1].start() if index + 1 < len(ordered) else len(full_text)
        segment = clean_question_text(full_text[match.start() : end])
        page = 1
        for page_index, offset in enumerate(page_offsets, start=1):
            if offset <= match.start():
                page = page_index
            else:
                break
        if segment:
            questions[number] = {"statement": segment, "page": page}
    return questions


def question_headers_on_page(page: object) -> list[tuple[int, float]]:
    fragments: list[tuple[float, float, str]] = []

    def visitor_text(text: str, cm: object, tm: object, font: object, size: object) -> None:
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            fragments.append((round(float(tm[5]), 1), float(tm[4]), text))

    try:
        page.extract_text(visitor_text=visitor_text)
    except Exception:
        return []

    lines: list[dict[str, object]] = []
    for y, x, text in sorted(fragments, key=lambda item: (-item[0], item[1])):
        for line in lines:
            if abs(float(line["y"]) - y) < 2.5:
                line["parts"].append((x, text))  # type: ignore[index]
                break
        else:
            lines.append({"y": y, "parts": [(x, text)]})

    headers: list[tuple[int, float]] = []
    for line in lines:
        line_text = " ".join(text for _, text in sorted(line["parts"]))  # type: ignore[arg-type]
        match = re.search(r"\bQUEST(?:ÃO|AO)\s*((?:\d\s*){1,2})\b", line_text, flags=re.I)
        if not match:
            continue
        number = int(re.sub(r"\s+", "", match.group(1)))
        if 1 <= number <= 40:
            headers.append((number, float(line["y"])))
    return headers


def collect_image_placements(page: object) -> list[dict[str, object]]:
    placements: list[dict[str, object]] = []
    resources = page.get("/Resources") or {}
    xobjects_ref = resources.get("/XObject")
    if not xobjects_ref:
        return placements
    xobjects = xobjects_ref.get_object()

    image_names = {
        name
        for name, ref in xobjects.items()
        if ref.get_object().get("/Subtype") == "/Image"
    }

    image_lookup = {
        f"/{Path(image.name).stem}": image
        for image in getattr(page, "images", [])
        if getattr(image, "name", None)
    }

    def visitor_operand_before(op: bytes, args: object, cm: object, tm: object) -> None:
        if op != b"Do" or not args:
            return
        name = str(args[0])
        if name not in image_names:
            return
        a, b, c, d, e, f = [float(value) for value in cm]
        width = (a * a + b * b) ** 0.5
        height = (c * c + d * d) ** 0.5
        placements.append(
            {
                "name": name,
                "image": image_lookup.get(name),
                "x": e,
                "y": f,
                "width": width,
                "height": height,
            }
        )

    try:
        page.extract_text(visitor_operand_before=visitor_operand_before)
    except Exception:
        return placements

    return placements


def likely_question_image(placement: dict[str, object], page_width: float, page_height: float) -> bool:
    width = float(placement["width"])
    height = float(placement["height"])
    y = float(placement["y"])

    if width < 35 or height < 35:
        return False
    if width > page_width * 0.55 and height < 80 and y > page_height * 0.72:
        return False
    if width / max(height, 1) > 7 and y > page_height * 0.65:
        return False
    if height / max(width, 1) > 10:
        return False
    return placement.get("image") is not None


def assign_image_to_question(
    page_number: int,
    center_y: float,
    headers: list[tuple[int, float]],
    question_starts: dict[int, int],
) -> int | None:
    def previous_question_before_page() -> int | None:
        previous = [
            (number, start_page)
            for number, start_page in question_starts.items()
            if start_page < page_number
        ]
        if not previous:
            return None
        previous.sort(key=lambda item: (item[1], item[0]))
        return previous[-1][0]

    if headers:
        headers = sorted(headers, key=lambda item: item[1], reverse=True)
        if center_y > headers[0][1]:
            previous_question = previous_question_before_page()
            if previous_question is not None:
                return previous_question
            return headers[0][0]
        if len(headers) == 1:
            return headers[0][0]
        for index, (number, y) in enumerate(headers):
            next_y = headers[index + 1][1] if index + 1 < len(headers) else -1
            if y >= center_y > next_y:
                return number
        return headers[-1][0]

    same_page = [number for number, start_page in question_starts.items() if start_page == page_number]
    if same_page:
        return min(same_page)

    ordered = sorted(question_starts.items(), key=lambda item: (item[1], item[0]))
    for index, (number, start_page) in enumerate(ordered):
        if index + 1 >= len(ordered):
            continue
        next_start = ordered[index + 1][1]
        if start_page < page_number < next_start:
            return number
    return None


def extract_question_images(
    pdf_path: Path,
    year: int,
    questions_for_source: list[dict[str, object]],
) -> dict[str, list[dict[str, object]]]:
    if not questions_for_source:
        return {}

    question_starts = {
        int(question["number"]): int(question["page"])
        for question in questions_for_source
        if question.get("page")
    }
    if not question_starts:
        return {}

    images_by_question: dict[str, list[dict[str, object]]] = {}
    reader = PdfReader(str(pdf_path))
    for page_index, page in enumerate(reader.pages, start=1):
        headers = question_headers_on_page(page)
        page_width = float(page.mediabox.width)
        page_height = float(page.mediabox.height)
        image_number = 0
        for placement in collect_image_placements(page):
            if not likely_question_image(placement, page_width, page_height):
                continue
            center_y = float(placement["y"]) + float(placement["height"]) / 2
            question_number = assign_image_to_question(
                page_index, center_y, headers, question_starts
            )
            if not question_number:
                continue

            image_number += 1
            question_id = f"{year}-{question_number:02d}"
            file_name = f"{question_id}-p{page_index:02d}-{image_number:02d}.png"
            out_path = IMAGE_DIR / file_name

            pil_image = placement["image"].image  # type: ignore[union-attr]
            if pil_image.mode in {"CMYK", "P"}:
                pil_image = pil_image.convert("RGB")
            elif pil_image.mode not in {"RGB", "RGBA", "L"}:
                pil_image = pil_image.convert("RGBA")
            pil_image.save(out_path)

            images_by_question.setdefault(question_id, []).append(
                {
                    "src": out_path.relative_to(ROOT).as_posix(),
                    "page": page_index,
                    "x": round(float(placement["x"]), 2),
                    "y": round(float(placement["y"]), 2),
                    "width": round(float(placement["width"]), 2),
                    "height": round(float(placement["height"]), 2),
                    "alt": f"Figura da questão {question_number} de {year}",
                }
            )
    return images_by_question


def normalize_descriptor_codes(raw: str) -> list[str]:
    raw = raw.replace("D;", "D").replace("D -", "D-")
    codes: list[str] = []

    for start, end in re.findall(
        r"D\s*[-;]?\s*(\d{1,2})\s*-\s*D?\s*[-;]?\s*(\d{1,2})", raw
    ):
        start_number = int(start)
        end_number = int(end)
        if start_number <= end_number and end_number - start_number <= 8:
            codes.extend([f"D{number}" for number in range(start_number, end_number + 1)])

    codes.extend([f"D{number}" for number in re.findall(r"D\s*[-;]?\s*(\d{1,2})", raw)])

    seen: set[str] = set()
    result: list[str] = []
    for code in codes:
        if code not in seen:
            seen.add(code)
            result.append(code)
    return result


def answer_priority(source_kind: str, text: str) -> int:
    upper = text.upper()
    priority = 30
    if source_kind in {"gabarito", "prova-gabarito"}:
        priority = 50
    if (
        "GABARITO FINAL" in upper
        or "FINAL APÓS" in upper
        or "FINAL APOS" in upper
        or "APÓS RECURSOS" in upper
        or "APOS RECURSOS" in upper
    ):
        priority = 80
    return priority


def gabarito_region(text: str, source_kind: str) -> str:
    upper = text.upper()
    if source_kind != "gabarito":
        positions = [match.start() for match in re.finditer("GABARITO", upper)]
        if positions:
            text = text[max(0, positions[-1] - 900) :]
            upper = text.upper()

    for marker in [
        "CURSOS TÉCNICOS SUBSEQUENTES",
        "CURSO TÉCNICO SUBSEQUENTE",
        "TÉCNICO SUBSEQUENTE",
    ]:
        index = upper.find(marker)
        if index > 0:
            text = text[:index]
            break
    return text


def extract_answer_key(text: str, source_kind: str) -> dict[int, dict[str, object]]:
    if "GABARITO" not in text.upper() and "QUESTÃO GABARITO" not in text.upper():
        return {}

    region = gabarito_region(text, source_kind)
    if source_kind != "gabarito" and "QUESTÃO GABARITO" not in region.upper():
        return {}
    entry_re = re.compile(r"(?<![D\d-])(\d{1,2})\.?\s+(ANULADA|[A-E])\b")
    entries = [
        match for match in entry_re.finditer(region) if 1 <= int(match.group(1)) <= 40
    ]
    answers: dict[int, dict[str, object]] = {}
    for index, match in enumerate(entries):
        number = int(match.group(1))
        if number in answers:
            continue
        next_start = entries[index + 1].start() if index + 1 < len(entries) else len(region)
        raw_descriptors = region[match.end() : next_start]
        answers[number] = {
            "answer": match.group(2),
            "descriptors": normalize_descriptor_codes(raw_descriptors),
        }
    return answers


def parse_descriptor_matrix(edital_pages: list[str]) -> dict[str, dict[str, object]]:
    # Pages 68-77 contain the matrix for integrated/concomitant candidates.
    matrix_text = "\n".join(edital_pages[67:77])
    descriptors: dict[str, dict[str, object]] = {}
    current_discipline = ""
    current_topic = ""
    current_code = ""

    def flush_line_to_current(line: str) -> None:
        nonlocal current_code
        if not current_code:
            return
        key = f"{current_discipline}::{current_code}"
        descriptors[key]["description"] = (
            f"{descriptors[key]['description']} {line}".strip()
        )

    for raw_line in matrix_text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line:
            continue
        heading = re.match(r"Matriz de Referência de (.+)", line)
        if heading:
            current_discipline = heading.group(1).strip()
            current_topic = ""
            current_code = ""
            continue
        if line.startswith("Tópico ") or line.startswith("Tema "):
            current_topic = line
            current_code = ""
            continue
        if line.startswith("Descritor ") or line.startswith("ANEXO XII"):
            continue
        if line.startswith("MATRIZES DE REFERÊNCIA"):
            continue
        if line.startswith("EDITAL "):
            continue

        descriptor = re.match(r"^(D\d{1,2})\s+(.+)", line)
        if descriptor and current_discipline:
            current_code = descriptor.group(1)
            key = f"{current_discipline}::{current_code}"
            descriptors[key] = {
                "code": current_code,
                "discipline": current_discipline,
                "topic": current_topic,
                "description": descriptor.group(2).strip(),
            }
            continue
        flush_line_to_current(line)

    return descriptors


def build_catalog(resolutions_source: dict[str, dict[str, object]]) -> dict[str, object]:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for old_image in IMAGE_DIR.glob("*.png"):
        old_image.unlink()

    try:
        source_paths = sorted(SOURCE_DIR.glob("*.pdf"))
    except Exception:
        source_paths = []
    using_local_sources = not source_paths
    if using_local_sources:
        source_paths = sorted(PDF_DIR.glob("*.pdf"))
    if not using_local_sources and EDITAL_PATH.exists():
        source_paths.append(EDITAL_PATH)

    sources: list[dict[str, object]] = []
    texts_by_source: dict[str, list[str]] = {}

    for src in source_paths:
        local_pdf = copy_pdf(src)
        pages, page_count = read_pdf_pages(src)
        kind = classify_source(src.name)
        year = year_from_name(src.name)
        source_id = slugify(src.stem, limit=80)
        texts_by_source[source_id] = pages
        sources.append(
            {
                "id": source_id,
                "year": year,
                "kind": kind,
                "title": src.stem,
                "originalName": src.name,
                "pdf": local_pdf,
                "pages": page_count,
                "textChars": sum(len(page) for page in pages),
                "textExtracted": bool(sum(len(page.strip()) for page in pages)),
            }
        )

    by_year: dict[int, dict[str, object]] = {}
    answer_candidates: dict[int, list[dict[str, object]]] = {}

    for source in sources:
        year = source.get("year")
        if not isinstance(year, int):
            continue
        by_year.setdefault(year, {"sources": [], "questions": {}, "answers": {}})
        by_year[year]["sources"].append(source)

        pages = texts_by_source[source["id"]]
        text = "\n".join(pages)
        kind = str(source["kind"])

        if kind in {"prova", "prova-gabarito"}:
            extracted_questions = extract_questions(pages)
            if extracted_questions:
                by_year[year]["questions"] = extracted_questions

        answers = extract_answer_key(text, kind)
        if answers:
            answer_candidates.setdefault(year, []).append(
                {
                    "priority": answer_priority(kind, text),
                    "source": source,
                    "answers": answers,
                }
            )

    chosen_answers: dict[int, dict[int, dict[str, object]]] = {}
    answer_source_by_year: dict[int, dict[str, object]] = {}
    for year, candidates in answer_candidates.items():
        candidates.sort(key=lambda item: int(item["priority"]), reverse=True)
        chosen = candidates[0]
        chosen_answers[year] = chosen["answers"]  # type: ignore[assignment]
        answer_source_by_year[year] = chosen["source"]  # type: ignore[assignment]

    edital_pages = texts_by_source.get(slugify(EDITAL_PATH.stem, limit=80), [])
    descriptor_matrix = parse_descriptor_matrix(edital_pages) if edital_pages else {}

    questions: list[dict[str, object]] = []
    for year in sorted(by_year):
        proof_sources = [
            src
            for src in by_year[year]["sources"]
            if src["kind"] in {"prova", "prova-gabarito"}
        ]
        proof_source = proof_sources[0] if proof_sources else None
        extracted_questions = by_year[year]["questions"]
        answers = chosen_answers.get(year, {})
        available_numbers = sorted(set(extracted_questions.keys()) | set(answers.keys()))
        if not available_numbers and proof_source:
            available_numbers = list(range(1, 41))

        for number in available_numbers:
            discipline, area = discipline_for_number(number)
            question_id = f"{year}-{number:02d}"
            question_text = extracted_questions.get(number, {})
            answer_info = answers.get(number, {})
            descriptor_codes = answer_info.get("descriptors", [])
            prompt, raw_statement, alternatives = split_statement_and_alternatives(
                str(question_text.get("statement", ""))
            )
            structured_prompt = structure_question_prompt(prompt or raw_statement)
            statement = str(structured_prompt.get("statement") or "").strip()
            support_text = str(structured_prompt.get("textoApoio") or "").strip()
            reference_lines = [
                str(item).strip()
                for item in (structured_prompt.get("fonteReferencia") or [])
                if str(item).strip()
            ]
            descriptor_details = []
            for code in descriptor_codes:
                detail = descriptor_matrix.get(f"{discipline}::{code}")
                descriptor_details.append(
                    {
                        "code": code,
                        "description": detail.get("description", "") if detail else "",
                        "topic": detail.get("topic", "") if detail else "",
                    }
                )

            descriptor = {
                "codes": descriptor_codes,
                "details": descriptor_details,
            }
            raw_resolution = resolutions_source.get(question_id, {})
            normalized_resolution = normalize_resolution(raw_resolution)
            content_summary = infer_content_summary(
                discipline,
                "\n\n".join(
                    part for part in [support_text, statement, "\n".join(reference_lines)] if part
                )
                or raw_statement,
                normalized_resolution,
                descriptor_details,
            )
            priority = infer_question_priority(
                discipline,
                content_summary,
                "\n\n".join(
                    part for part in [support_text, statement, "\n".join(reference_lines)] if part
                )
                or raw_statement,
                normalized_resolution,
            )
            status = question_status(
                answer_info.get("answer"),
                descriptor_codes,
                statement,
                alternatives,
                normalized_resolution,
            )
            if status == "completa" and not is_valid_complete_question(
                answer_info.get("answer"),
                statement,
                alternatives,
            ):
                status = "revisar"

            questions.append(
                {
                    "id": question_id,
                    "year": year,
                    "number": number,
                    "discipline": discipline,
                    "area": area,
                    "statement": statement,
                    "statementRaw": raw_statement,
                    "textoApoio": support_text,
                    "fonteReferencia": reference_lines,
                    "alternatives": alternatives,
                    "page": question_text.get("page"),
                    "answer": answer_info.get("answer"),
                    "descriptor": descriptor,
                    "descriptors": descriptor_codes,
                    "descriptorDetails": descriptor_details,
                    "conteudoResumo": content_summary,
                    "prioridade": priority,
                    "sourcePdf": proof_source.get("pdf") if proof_source else None,
                    "answerPdf": answer_source_by_year.get(year, {}).get("pdf"),
                    "hasExtractedText": bool(question_text.get("statement")),
                    "images": [],
                    "imagemApoio": [],
                    "apoioTipos": [],
                    "resolution": normalized_resolution,
                    "status": status,
                    "manualReview": {
                        "needed": False,
                        "reasons": [],
                    },
                }
            )

    questions_by_source: dict[tuple[int, str], list[dict[str, object]]] = {}
    for question in questions:
        if question.get("sourcePdf") and question.get("page"):
            questions_by_source.setdefault(
                (int(question["year"]), str(question["sourcePdf"])), []
            ).append(question)

    images_by_question: dict[str, list[dict[str, object]]] = {}
    for (year, source_pdf), grouped_questions in questions_by_source.items():
        pdf_path = ROOT / source_pdf
        if not pdf_path.exists():
            continue
        extracted = extract_question_images(pdf_path, year, grouped_questions)
        for question_id, images in extracted.items():
            images_by_question.setdefault(question_id, []).extend(images)

    for question in questions:
        support_images = images_by_question.get(str(question["id"]), [])
        question["images"] = support_images
        question["imagemApoio"] = support_images
        question["apoioTipos"] = infer_support_types(
            str(question.get("textoApoio") or ""),
            str(question.get("statement") or ""),
            [str(item) for item in question.get("fonteReferencia") or []],
            len(support_images),
        )
        review_reasons = manual_review_reasons(question)
        question["manualReview"] = {
            "needed": bool(review_reasons),
            "reasons": review_reasons,
        }
        if question.get("status") == "completa" and "alternativa_com_texto_estranho" in review_reasons:
            question["status"] = "revisar"

    valid_questions = [item for item in questions if item.get("status") == "completa"]
    valid_by_discipline = {
        discipline: sum(1 for item in valid_questions if item.get("discipline") == discipline)
        for _, _, discipline, _ in DISCIPLINE_RANGES
    }
    valid_by_year = {
        year: sum(1 for item in valid_questions if int(item.get("year", 0)) == year)
        for year in sorted({int(item.get("year", 0)) for item in valid_questions})
    }
    simulado_blueprint = {
        discipline: {
            "count": valid_by_discipline.get(discipline, 0),
            "needed": end - start + 1,
            "canBuild": valid_by_discipline.get(discipline, 0) >= (end - start + 1),
            "coverage": (
                valid_by_discipline.get(discipline, 0) // (end - start + 1)
                if end - start + 1
                else 0
            ),
        }
        for start, end, discipline, _ in DISCIPLINE_RANGES
    }

    descriptor_usage: dict[str, dict[str, object]] = {}
    for question in questions:
        discipline = str(question["discipline"])
        for detail in question["descriptorDetails"]:
            code = str(detail["code"])
            key = f"{discipline}::{code}"
            usage = descriptor_usage.setdefault(
                key,
                {
                    "id": key,
                    "code": code,
                    "discipline": discipline,
                    "topic": detail.get("topic", ""),
                    "description": detail.get("description", ""),
                    "count": 0,
                    "questions": [],
                },
            )
            usage["count"] = int(usage["count"]) + 1
            usage["questions"].append(question["id"])

    return {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "title": "Preparatório IFFluminense",
        "sources": sources,
        "questions": questions,
        "descriptors": sorted(
            descriptor_usage.values(),
            key=lambda item: (str(item["discipline"]), str(item["code"])),
        ),
        "descriptorMatrix": sorted(
            descriptor_matrix.values(),
            key=lambda item: (str(item["discipline"]), str(item["code"])),
        ),
        "stats": {
            "sources": len(sources),
            "questions": len(questions),
            "questionsWithAnswers": sum(1 for item in questions if item.get("answer")),
            "questionsWithDescriptors": sum(
                1 for item in questions if item.get("descriptors")
            ),
            "questionsWithText": sum(1 for item in questions if item.get("hasExtractedText")),
            "questionsWithAlternatives": sum(
                1 for item in questions if item.get("alternatives")
            ),
            "questionsWithContentSummary": sum(
                1 for item in questions if str(item.get("conteudoResumo") or "").strip()
            ),
            "questionsWithSupportText": sum(
                1 for item in questions if str(item.get("textoApoio") or "").strip()
            ),
            "questionsWithReferences": sum(
                1 for item in questions if item.get("fonteReferencia")
            ),
            "questionsWithSupportImages": sum(
                1 for item in questions if item.get("imagemApoio")
            ),
            "priorityCounts": {
                level: sum(1 for item in questions if item.get("prioridade") == level)
                for level in ["alta", "media", "baixa"]
            },
            "questionsWithResolutions": sum(
                1 for item in questions if has_resolution_content(item.get("resolution", {}))
            ),
            "validQuestions": len(valid_questions),
            "validQuestionsByDiscipline": valid_by_discipline,
            "validQuestionsByYear": valid_by_year,
            "simuladoBlueprint": simulado_blueprint,
            "statusCounts": {
                status: sum(1 for item in questions if item.get("status") == status)
                for status in ["completa", "sem_resolucao", "sem_gabarito", "revisar"]
            },
            "questionsNeedingManualReview": sum(
                1
                for item in questions
                if isinstance(item.get("manualReview"), dict)
                and item["manualReview"].get("needed")
            ),
            "questionImages": sum(len(item.get("images", [])) for item in questions),
            "years": sorted(by_year),
        },
        "buildNotes": [
            "PDFs sem texto extraível ou gabarito escaneado permanecem vinculados como arquivo original.",
            "Descritores foram extraídos do Anexo XII do edital 79/2025 para cursos integrados e concomitantes.",
            "Gabaritos finais embutidos nas provas têm prioridade sobre comunicados preliminares quando disponíveis.",
            "Textos legíveis ficam digitados; imagens são extraídas apenas quando existem como elementos visuais reais no PDF.",
        ],
    }


def main() -> None:
    resolutions_source = load_resolutions_source()
    catalog = build_catalog(resolutions_source)
    (DATA_DIR / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(
        "Catalog built:",
        catalog["stats"],
        f"-> {(DATA_DIR / 'catalog.json').relative_to(ROOT)}",
    )


if __name__ == "__main__":
    main()
