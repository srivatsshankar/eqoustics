import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
import traceback

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")


DEFAULT_COMMANDS = [
    {
        "command": "new-line",
        "name": "new line",
        "category": "formatting",
        "description": "Create a new row below the current row.",
        "aliases": ["newline", "new row", "next line"],
    },
    {
        "command": "new-paragraph",
        "name": "new paragraph",
        "category": "formatting",
        "description": "Create a blank row after the current row for a new paragraph.",
        "aliases": ["next paragraph", "new para"],
    },
    {
        "command": "go-to-row",
        "name": "go to row {number}",
        "category": "navigation",
        "description": "Move the cursor to the requested row number.",
        "aliases": [
            "go to line {number}",
            "go row {number}",
            "go line {number}",
            "select line {number}",
            "select row {number}",
        ],
    },
    {
        "command": "go-to-end",
        "name": "go to end",
        "category": "navigation",
        "description": "Move the cursor to the last row of the document.",
        "aliases": ["go to last row", "go to last line", "go to bottom"],
    },
    {
        "command": "bold-that",
        "name": "bold that",
        "category": "formatting",
        "description": "Apply bold formatting to the last entered text or typed word.",
        "aliases": ["make that bold"],
    },
    {
        "command": "italic-that",
        "name": "italic that",
        "category": "formatting",
        "description": "Apply italic formatting to the last entered text or typed word.",
        "aliases": ["italics that", "make that italic", "make that italics"],
    },
    {
        "command": "underline-that",
        "name": "underline that",
        "category": "formatting",
        "description": "Apply underline formatting to the last entered text or typed word.",
        "aliases": ["underlined that", "make that underlined"],
    },
    {
        "command": "bold-row",
        "name": "bold row",
        "category": "formatting",
        "description": "Apply bold formatting to the entire current row.",
        "aliases": ["bold line"],
    },
    {
        "command": "italic-row",
        "name": "italic row",
        "category": "formatting",
        "description": "Apply italic formatting to the entire current row.",
        "aliases": ["italics row", "italic line", "italics line"],
    },
    {
        "command": "underline-row",
        "name": "underline row",
        "category": "formatting",
        "description": "Apply underline formatting to the entire current row.",
        "aliases": ["underline line", "underlined row", "underlined line"],
    },
    {
        "command": "capitalize-row",
        "name": "capitalize row",
        "category": "formatting",
        "description": "Capitalize each word in the current row.",
        "aliases": ["capitalize that", "capitalize line", "title case row", "title case that", "title case line"],
    },
    {
        "command": "sentence-case-row",
        "name": "sentence case",
        "category": "formatting",
        "description": "Capitalize the first word in the current row.",
        "aliases": ["sentence case row", "sentence case that", "sentence case line"],
    },
    {
        "command": "lowercase-row",
        "name": "lowercase row",
        "category": "formatting",
        "description": "Lowercase the current row.",
        "aliases": ["lowercase that", "lowercase line", "lower case row", "lower case that", "lower case line"],
    },
    {
        "command": "heading-1",
        "name": "heading 1",
        "category": "formatting",
        "description": "Convert the current row to heading level 1.",
        "aliases": ["heading one", "heading level 1", "heading level one"],
    },
    {
        "command": "heading-2",
        "name": "heading 2",
        "category": "formatting",
        "description": "Convert the current row to heading level 2.",
        "aliases": ["heading two", "heading level 2", "heading level two"],
    },
    {
        "command": "heading-3",
        "name": "heading 3",
        "category": "formatting",
        "description": "Convert the current row to heading level 3.",
        "aliases": ["heading three", "heading level 3", "heading level three"],
    },
    {
        "command": "heading-4",
        "name": "heading 4",
        "category": "formatting",
        "description": "Convert the current row to heading level 4.",
        "aliases": ["heading four", "heading level 4", "heading level four"],
    },
    {
        "command": "delete-that",
        "name": "delete that",
        "category": "formatting",
        "description": "Delete the last entered text or typed word.",
        "aliases": ["remove that"],
    },
    {
        "command": "delete-row",
        "name": "delete row",
        "category": "formatting",
        "description": "Delete the entire current row.",
        "aliases": ["delete line", "remove row", "remove line"],
    },
    {
        "command": "clear-row",
        "name": "clear row",
        "category": "formatting",
        "description": "Clear the current row without deleting it.",
        "aliases": ["clear line"],
    },
    {
        "command": "bullet-that",
        "name": "bullet that",
        "category": "formatting",
        "description": "Apply bullet list formatting to the current row.",
        "aliases": ["bullet row", "bullet line"],
    },
    {
        "command": "number-that",
        "name": "number that",
        "category": "formatting",
        "description": "Apply numbered list formatting to the current row.",
        "aliases": ["number row", "number line", "numbering that", "numbered list that"],
    },
    {
        "command": "correction",
        "name": "correction",
        "category": "formatting",
        "description": "Tell the LaTeX processor to update the current row instead of inserting new content.",
        "aliases": ["correct", "edit", "fix"],
    },
    {
        "command": "save-document",
        "name": "save",
        "category": "navigation",
        "description": "Save the current document.",
        "aliases": ["save document"],
    },
    {
        "command": "save-document-as",
        "name": "save as",
        "category": "navigation",
        "description": "Open the save-as prompt for the current document.",
        "aliases": ["save document as"],
    },
    {
        "command": "open-document",
        "name": "open document",
        "category": "navigation",
        "description": "Open the document picker.",
        "aliases": ["open file"],
    },
    {
        "command": "undo-that",
        "name": "undo that",
        "category": "navigation",
        "description": "Undo the last action.",
        "aliases": ["undo"],
    },
    {
        "command": "redo-that",
        "name": "redo that",
        "category": "navigation",
        "description": "Redo the last undone action.",
        "aliases": ["redo"],
    },
    {
        "command": "type-correction",
        "name": "type correction {text}",
        "category": "formatting",
        "description": "Correct the current row as written text instead of converting the correction to LaTeX math.",
        "aliases": ["type correction", "text correction {text}", "correct text {text}", "fix text {text}"],
    },
    {
        "command": "type-text",
        "name": "type {text}",
        "category": "formatting",
        "description": "Type the following text verbatim without converting it to LaTeX.",
        "aliases": [],
    },
    {
        "command": "help-me",
        "name": "help me",
        "category": "navigation",
        "description": "Toggle the help menu.",
        "aliases": ["open help"],
    },
    {
        "command": "close-help",
        "name": "close help",
        "category": "navigation",
        "description": "Close the help menu.",
        "aliases": ["hide help"],
    },
    {
        "command": "minimize-window",
        "name": "minimize window",
        "category": "navigation",
        "description": "Minimize the application window.",
        "aliases": ["minimise window"],
    },
    {
        "command": "maximize-window",
        "name": "maximize window",
        "category": "navigation",
        "description": "Maximize or restore the application window.",
        "aliases": ["maximise window"],
    },
    {
        "command": "close-window",
        "name": "close window",
        "category": "navigation",
        "description": "Close the application window.",
        "aliases": [],
    },
    {
        "command": "silence",
        "name": "silence",
        "category": "microphone",
        "description": "Keep the microphone active but ignore speech until the listen command is heard.",
        "aliases": ["silent"],
    },
    {
        "command": "listen",
        "name": "listen",
        "category": "microphone",
        "description": "Resume processing speech after silence mode.",
        "aliases": ["start listening"],
    },
    {
        "command": "deactivate-microphone",
        "name": "deactivate microphone",
        "category": "microphone",
        "description": "Turn off speech recognition.",
        "aliases": ["disable microphone", "turn off microphone", "stop listening"],
    },
]

NUMBER_UNITS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
}

NUMBER_TEENS = {
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
}

NUMBER_TENS = {
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
    "eighty": 80,
    "ninety": 90,
}

NUMBER_SCALES = {
    "thousand": 1_000,
    "million": 1_000_000,
}

NUMBER_WORDS = {
    **NUMBER_UNITS,
    **NUMBER_TEENS,
    **NUMBER_TENS,
}

NUMBER_PHRASE_WORDS = set(NUMBER_WORDS) | {"and", "hundred", *NUMBER_SCALES}


def build_transcription_prompt():
    return """
Transcribe the provided audio exactly.
Return only the plain transcript text.
Do not return JSON, Markdown, labels, LaTeX, explanations, apologies, or anything else.
""".strip()


def build_latex_workflow_prompt(transcript):
    return ("""
Convert the transcript to an Eqoustics editor action.
Return exactly:
ACTION: INSERT|REPLACE_ROW
LATEX: <raw LaTeX|NO_LATEX>
END

Rules:
- This is a math editor. Treat math dictation as LaTeX, not prose.
- Default to LaTeX for any transcript that can reasonably be interpreted as symbolic, mathematical, or notation-like.
- Never return NO_LATEX for variables, numbers with operators, equations, fractions, powers, roots, integrals, sums, matrices, Greek letters, sets, logic, or speech operator phrases.
- Use REPLACE_ROW for corrections/edits/removals/replacements of the current row. Call get_current_row_latex first, then return the full corrected row.
- For context-dependent insertions like continue, append, complete, or insert after the current expression, call get_current_row_latex first.
- For standalone math dictation, do not call tools; convert directly to LaTeX.
- Mathematical speech returns raw LaTeX only, without $, $$, \\[, \\], \\(, or \\).
- Preserve spoken relation operators. "equals", "equal to", "equals sign", and "literal symbol equals" must produce = in the matching location.
- Preserve normal spoken math operators instead of omitting them or replacing them with plain words. Use standard LaTeX notation such as +, -, \\times, \\div, /, <, >, \\leq, \\geq, \\neq, \\approx, \\pm, \\cdot, \\in, \\subset, \\cup, \\cap, and \\rightarrow when the transcript calls for them.
- Only plain non-math prose returns LATEX: NO_LATEX. Do not wrap prose in \\text{}.
- Matrices use standard LaTeX environments, \\\\ row separators, and & cells.

Examples:

Transcript: x squared over 2 minus 3
ACTION: INSERT
LATEX: \\frac{x^2}{2} - 3
END

Transcript: that's the conclusion of the proof
ACTION: INSERT
LATEX: NO_LATEX
END

Transcript: make that a plus instead of minus
ACTION: REPLACE_ROW
LATEX: \\frac{x^2}{2} + 3
END

Transcript: plus 5
ACTION: INSERT
LATEX: + 5
END

Transcript: equals 125
ACTION: INSERT
LATEX: = 125
END

Transcript: x times y divided by z
ACTION: INSERT
LATEX: x \\times y \\div z
END

Transcript: x equals y
ACTION: INSERT
LATEX: x = y
END

Transcript: x literal symbol equals x
ACTION: INSERT
LATEX: x = x
END

Transcript:
""" + (transcript or "")).strip()


def build_text_correction_prompt(correction, current_row_latex=None):
    current_row_text = latex_plain_text_to_text(current_row_latex or "")
    return f"""
Correct the current Eqoustics row as ordinary written text.
Return exactly:
TEXT: <full corrected row text>
END

Rules:
- Use the correction request to edit the current row text.
- Return the full corrected row text, not just the changed words.
- Do not return LaTeX, Markdown, JSON, explanations, labels other than TEXT, or apologies.
- Preserve the user's wording unless the correction request changes it.
- Apply normal sentence capitalization and punctuation for written text.

Current row text:
{current_row_text}

Correction request:
{correction or ""}
""".strip()


def plain_text_to_latex(text):
    converted = []
    for char in str(text or ""):
        if char == "\\":
            converted.append("\\textbackslash{}")
        elif char in {"{", "}"}:
            converted.append(f"\\{char}")
        else:
            converted.append(char)
    return "".join(converted)


def latex_plain_text_to_text(latex):
    text = str(latex or "")
    text = text.replace("\\textbackslash{}", "\\")
    text = text.replace("\\{", "{").replace("\\}", "}")
    return text


def should_capitalize_inserted_text(current_row_latex):
    current_text = latex_plain_text_to_text(current_row_latex or "").rstrip()
    if not current_text:
        return True
    return re.search(r"[.!?][\"')\]}]*$", current_text) is not None


def capitalize_spoken_plain_text(text, current_row_latex=None):
    chars = list(str(text or ""))
    capitalize_next = should_capitalize_inserted_text(current_row_latex)
    opening_punctuation = set("\"'([{")

    for index, char in enumerate(chars):
        if char.isspace() or char in opening_punctuation:
            continue
        if capitalize_next and char.isalpha():
            chars[index] = char.upper()
        capitalize_next = False
        if char in ".!?":
            capitalize_next = True

    return re.sub(r"\bi\b", "I", "".join(chars))


engine = None
engine_load_command = None
engine_backend_name = None
engine_speculative_decoding = None
engine_runtime = None
initialized_command_databases = set()
command_cache = {}


BACKEND_PREFERENCE_ORDER = {
    "auto": ["gpu", "cpu"],
    "gpu": ["gpu", "cpu"],
    "cpu": ["cpu"],
    "npu": ["npu", "gpu", "cpu"],
}


def backend_candidates_from_name(litert_lm, name):
    requested = str(name or os.environ.get("EQOUSTICS_LITERT_BACKEND") or "auto").strip().lower()
    ordered_names = BACKEND_PREFERENCE_ORDER.get(requested, [requested, "cpu"])

    candidates = []
    seen = set()
    for backend_token in ordered_names:
        backend = getattr(litert_lm.Backend, backend_token.upper(), None)
        if backend is None or backend in seen:
            continue
        candidates.append(backend)
        seen.add(backend)

    if not candidates:
        candidates.append(litert_lm.Backend.CPU)
    return candidates


def import_litert_lm():
    try:
        import litert_lm
        return litert_lm
    except ModuleNotFoundError as exc:
        if exc.name in {"litert_lm", "lite_rt"}:
            raise RuntimeError(
                "LiteRT-LM Python dependency is missing or incomplete. "
                "On Ubuntu, run: python3 -m pip install --upgrade --force-reinstall 'litert-lm-api>=0.11.0'. "
                "If Eqoustics is using a different Python, set EQOUSTICS_PYTHON to that Python executable."
            ) from exc
        raise


def backend_name(value):
    return str(value).split(".")[-1].lower()


def normalize_runtime(value):
    return "litert"


def speech_timing_enabled():
    return os.environ.get("EQOUSTICS_SPEECH_TIMING") == "1"


def log_timing(label, started_at, **details):
    if not speech_timing_enabled():
        return

    detail_text = "".join(f" {key}={value}" for key, value in details.items() if value is not None)
    elapsed_ms = (time.perf_counter() - started_at) * 1000
    print(f"[speech timing] {label}: {elapsed_ms:.1f}ms{detail_text}", file=sys.stderr, flush=True)


def normalize_speculative_override(value):
    normalized = str(value or "auto").strip().lower()
    if normalized in {"1", "true", "yes", "on", "enabled"}:
        return "true"
    if normalized in {"0", "false", "no", "off", "disabled"}:
        return "false"
    return "auto"


def model_size_from_command(command):
    model_size = str(command.get("modelSize") or "").strip().lower()
    if model_size in {"2b", "4b"}:
        return model_size

    model_id = str(command.get("modelId") or "").strip().lower()
    if "e4b" in model_id or "4b" in model_id:
        return "4b"
    if "e2b" in model_id or "2b" in model_id:
        return "2b"
    return None


def speculative_modes_for_backend(backend, command):
    override = normalize_speculative_override(
        command.get("speculativeDecoding") or os.environ.get("EQOUSTICS_LITERT_SPECULATIVE_DECODING")
    )
    if override == "false":
        return ["disabled"]
    if override == "true":
        return ["enabled", "default"]

    backend = backend_name(backend)
    if backend == "cpu" and model_size_from_command(command) in {"2b", "4b"}:
        return ["enabled", "default"]
    return ["default"]


def apply_speculative_mode(kwargs, mode):
    if mode == "enabled":
        kwargs["enable_speculative_decoding"] = True
    elif mode == "disabled":
        kwargs["enable_speculative_decoding"] = False


def parse_positive_int(value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def clean_text(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    value = value.replace("```latex", "").replace("```", "")
    value = re.sub(r"\s+", " ", value)
    return value.strip().strip('"')


def restore_json_decoded_latex_escapes(value):
    replacements = {
        "\b": "\\b",
        "\f": "\\f",
        "\n": "\\n",
        "\r": "\\r",
        "\t": "\\t",
    }
    chars = []
    for index, char in enumerate(value or ""):
        if char in replacements and index + 1 < len(value) and re.match(r"[A-Za-z]", value[index + 1]):
            chars.append(replacements[char])
        else:
            chars.append(char)
    return "".join(chars)


def normalize_latex_fraction_shorthand(value):
    value = re.sub(r"(\\(?:dfrac|tfrac|frac))\s*([A-Za-z0-9])\s*\{([^{}]*)\}", r"\1{\2}{\3}", value)
    value = re.sub(r"(\\(?:dfrac|tfrac|frac))\s*\{([^{}]*)\}\s*([A-Za-z0-9])", r"\1{\2}{\3}", value)
    return re.sub(r"(\\(?:dfrac|tfrac|frac))\s*([A-Za-z0-9])\s*([A-Za-z0-9])", r"\1{\2}{\3}", value)


def normalize_latex_for_editor(value):
    value = normalize_latex_fraction_shorthand(value)
    value = re.sub(r"\s*\\\\\s*$", "", value).strip()
    value = re.sub(r"\s*\\\s*$", "", value).strip()

    wrappers = [
        ("$$", "$$"),
        ("\\[", "\\]"),
        ("\\(", "\\)"),
        ("$", "$"),
    ]
    changed = True
    while changed:
        changed = False
        stripped = value.strip()
        for left, right in wrappers:
            if stripped.startswith(left) and stripped.endswith(right) and len(stripped) >= len(left) + len(right):
                value = stripped[len(left):len(stripped) - len(right)].strip()
                value = re.sub(r"\s*\\\\\s*$", "", value).strip()
                value = re.sub(r"\s*\\\s*$", "", value).strip()
                changed = True
                break

    return value


def is_explanatory_or_apology(value):
    normalized = re.sub(r"\s+", " ", str(value or "").strip().lower())
    if not normalized:
        return False

    apology_prefixes = (
        "i'm sorry",
        "i am sorry",
        "sorry",
        "i apologize",
        "as an ai",
        "i can't",
        "i cannot",
        "i'm unable",
        "i am unable",
    )
    explanation_markers = (
        "cannot convert",
        "can't convert",
        "not able to convert",
        "unable to convert",
        "no latex",
        "not latex",
    )
    return normalized.startswith(apology_prefixes) or any(marker in normalized for marker in explanation_markers)


def looks_like_latex_or_math_source(value):
    stripped = str(value or "").strip()
    if not stripped:
        return False
    if "\\" in stripped:
        return True
    if re.search(r"[=+\-*/^_<>]|[{}\[\]&]", stripped):
        return True
    if re.search(r"\d", stripped) and re.search(r"[A-Za-z]", stripped):
        return True
    if re.fullmatch(r"[A-Za-z]", stripped):
        return True
    return False


def clean_raw_latex_result(value, require_math=False):
    value = (value or "").strip()
    value = re.sub(r"^```(?:latex|tex)?\s*", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\s*```$", "", value)
    value = value.strip().strip('"')

    if not value:
        return None
    if value.strip().lower() in {"no_latex", "null", "none"}:
        return None
    if is_explanatory_or_apology(value):
        return None

    value = normalize_latex_for_editor(value)
    if require_math and not looks_like_latex_or_math_source(value):
        return None
    return value


def normalize_workflow_action(value):
    normalized = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    if normalized in {"replace-row", "replace", "correct", "correction", "edit", "fix"}:
        return "replace-row"
    return "insert"


def response_text(response):
    if isinstance(response, str):
        return response
    if hasattr(response, "text"):
        return response.text

    if isinstance(response, dict):
        chunks = []
        for item in response.get("content", []):
            if item.get("type") == "text":
                chunks.append(item.get("text", ""))
        if chunks:
            return "".join(chunks)

    return str(response)


def workflow_has_end_marker(text):
    return re.search(r"(?im)^END\s*:?\s*$", text or "") is not None


def trim_after_workflow_end(text):
    match = re.search(r"(?im)^END\s*:?\s*$", text or "")
    if not match:
        return text
    return text[:match.end()]


def stream_response_text_until_end(conversation, message):
    chunks = []
    stream = conversation.send_message_async(message)
    try:
        for chunk in stream:
            text = response_text(chunk)
            if not text:
                continue

            chunks.append(text)
            combined = "".join(chunks)
            if not workflow_has_end_marker(combined):
                continue

            try:
                conversation.cancel_process()
            except Exception:
                pass
            return trim_after_workflow_end(combined)
    finally:
        close = getattr(stream, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                pass

    return "".join(chunks)


def send_latex_workflow_message(message, current_row_latex=None):
    current_row_latex = (current_row_latex or "").strip() or "(empty)"

    def get_current_row_latex():
        """Return the current editor row LaTeX when the transcript needs row context."""
        return current_row_latex

    try:
        with engine.create_conversation(
            tools=[get_current_row_latex],
            automatic_tool_calling=True,
        ) as conversation:
            streamed_text = stream_response_text_until_end(conversation, message)
            if streamed_text:
                return streamed_text
    except Exception as exc:
        if speech_timing_enabled():
            print(f"[speech timing] latex-stream-fallback error={exc}", file=sys.stderr, flush=True)

    with engine.create_conversation(automatic_tool_calling=False) as conversation:
        return response_text(conversation.send_message(message))


def send_text_correction_message(message):
    try:
        with engine.create_conversation(automatic_tool_calling=False) as conversation:
            streamed_text = stream_response_text_until_end(conversation, message)
            if streamed_text:
                return streamed_text
    except Exception as exc:
        if speech_timing_enabled():
            print(f"[speech timing] text-correction-stream-fallback error={exc}", file=sys.stderr, flush=True)

    with engine.create_conversation(automatic_tool_calling=False) as conversation:
        return response_text(conversation.send_message(message))


def parse_json_response(text):
    stripped = (text or "").strip()
    stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s*```$", "", stripped)

    try:
        return json.loads(stripped)
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", stripped)
    if not match:
        return None

    try:
        return json.loads(match.group(0))
    except Exception:
        return None


def relaxed_json_string_field(text, field_name):
    stripped = (text or "").strip()
    stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
    stripped = re.sub(r"\s*```$", "", stripped)

    match = re.search(rf'"{re.escape(field_name)}"\s*:\s*"', stripped)
    if not match:
        return None

    chars = []
    index = match.end()
    while index < len(stripped):
        char = stripped[index]
        if char == '"':
            return "".join(chars)
        if char == "\\" and index + 1 < len(stripped):
            next_char = stripped[index + 1]
            if next_char in ['"', "\\"]:
                chars.append(next_char)
            else:
                chars.append("\\")
                chars.append(next_char)
            index += 2
            continue
        chars.append(char)
        index += 1

    return None


def command_database_path(command):
    return command.get("commandDbPath") or os.path.join(os.path.dirname(__file__), "speech_commands.sqlite")


def ensure_command_database(db_path):
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    with sqlite3.connect(db_path) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS commands (
                internal_command TEXT PRIMARY KEY,
                command_name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'formatting',
                description TEXT NOT NULL,
                sort_order INTEGER NOT NULL
            )
        """)
        connection.execute("""
            CREATE TABLE IF NOT EXISTS command_aliases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                internal_command TEXT NOT NULL,
                alias TEXT NOT NULL,
                is_user_defined INTEGER NOT NULL DEFAULT 0,
                UNIQUE(internal_command, alias),
                FOREIGN KEY(internal_command) REFERENCES commands(internal_command) ON DELETE CASCADE
            )
        """)
        alias_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(command_aliases)").fetchall()
        }
        if "is_user_defined" not in alias_columns:
            connection.execute(
                "ALTER TABLE command_aliases ADD COLUMN is_user_defined INTEGER NOT NULL DEFAULT 0"
            )
        command_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(commands)").fetchall()
        }
        if "category" not in command_columns:
            connection.execute(
                "ALTER TABLE commands ADD COLUMN category TEXT NOT NULL DEFAULT 'formatting'"
            )
        for index, command in enumerate(DEFAULT_COMMANDS):
            connection.execute(
                """
                INSERT INTO commands (internal_command, command_name, category, description, sort_order)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(internal_command) DO UPDATE SET
                    command_name = excluded.command_name,
                    category = excluded.category,
                    description = excluded.description,
                    sort_order = excluded.sort_order
                """,
                (command["command"], command["name"], command["category"], command["description"], index),
            )
            connection.execute(
                "DELETE FROM command_aliases WHERE internal_command = ? AND is_user_defined = 0",
                (command["command"],),
            )
            connection.executemany(
                """
                INSERT OR IGNORE INTO command_aliases (internal_command, alias, is_user_defined)
                VALUES (?, ?, 0)
                """,
                [(command["command"], alias) for alias in command["aliases"]],
            )


def command_database_metadata(db_path):
    try:
        stats = os.stat(db_path)
    except OSError:
        return None
    return (stats.st_mtime_ns, stats.st_size)


def ensure_command_database_once(db_path):
    if db_path in initialized_command_databases and os.path.exists(db_path):
        return

    ensure_command_database(db_path)
    initialized_command_databases.add(db_path)


def read_commands_from_database(db_path):
    ensure_command_database_once(db_path)

    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT internal_command, command_name, category, description FROM commands ORDER BY sort_order, command_name"
        ).fetchall()
        alias_rows = connection.execute(
            "SELECT internal_command, alias, is_user_defined FROM command_aliases ORDER BY is_user_defined, alias"
        ).fetchall()

    aliases_by_command = {}
    user_aliases_by_command = {}
    for row in alias_rows:
        aliases_by_command.setdefault(row["internal_command"], []).append(row["alias"])
        if row["is_user_defined"]:
            user_aliases_by_command.setdefault(row["internal_command"], []).append(row["alias"])

    return [
        {
            "command": row["internal_command"],
            "name": row["command_name"],
            "category": row["category"],
            "description": row["description"],
            "aliases": aliases_by_command.get(row["internal_command"], []),
            "userAliases": user_aliases_by_command.get(row["internal_command"], []),
            "canCreateAliases": not command_has_variables(
                row["command_name"],
                aliases_by_command.get(row["internal_command"], []),
            ),
        }
        for row in rows
    ]


def cached_commands(db_path):
    ensure_command_database_once(db_path)
    metadata = command_database_metadata(db_path)
    cached = command_cache.get(db_path)
    if cached and cached["metadata"] == metadata:
        return cached["commands"]

    commands = read_commands_from_database(db_path)
    command_cache[db_path] = {
        "metadata": command_database_metadata(db_path),
        "commands": commands,
    }
    return commands


def list_commands(command):
    return cached_commands(command_database_path(command))


def command_has_variables(command_name, aliases=None):
    values = [command_name, *(aliases or [])]
    return any(re.search(r"\{[^{}]+\}", str(value or "")) for value in values)


def clean_user_alias(value):
    alias = normalize_phrase(value)
    if not alias:
        raise ValueError("Alias cannot be empty.")
    if len(alias) > 80:
        raise ValueError("Alias must be 80 characters or fewer.")
    if "{" in str(value or "") or "}" in str(value or ""):
        raise ValueError("Aliases cannot contain variables.")
    return alias


def add_command_alias(command):
    db_path = command_database_path(command)
    ensure_command_database_once(db_path)
    internal_command = str(command.get("command") or "").strip()
    alias = clean_user_alias(command.get("alias"))

    with sqlite3.connect(db_path) as connection:
        connection.row_factory = sqlite3.Row
        command_row = connection.execute(
            "SELECT internal_command, command_name FROM commands WHERE internal_command = ?",
            (internal_command,),
        ).fetchone()
        if command_row is None:
            raise ValueError("Unknown speech command.")

        alias_rows = connection.execute(
            "SELECT internal_command, alias FROM command_aliases ORDER BY is_user_defined, alias"
        ).fetchall()
        aliases_for_command = [
            row["alias"] for row in alias_rows if row["internal_command"] == internal_command
        ]
        if command_has_variables(command_row["command_name"], aliases_for_command):
            raise ValueError("Aliases can only be created for commands without variables.")

        command_name_matches_alias = normalize_phrase(command_row["command_name"]) == alias
        alias_matches_same_command = any(
            row["internal_command"] == internal_command and normalize_phrase(row["alias"]) == alias
            for row in alias_rows
        )
        if not command_name_matches_alias and not alias_matches_same_command:
            command_rows = connection.execute("SELECT internal_command, command_name FROM commands").fetchall()
            for row in command_rows:
                if normalize_phrase(row["command_name"]) == alias:
                    raise ValueError("That alias is already used by another command.")
            for row in alias_rows:
                if normalize_phrase(row["alias"]) == alias:
                    raise ValueError("That alias is already used by another command.")

            connection.execute(
                """
                INSERT INTO command_aliases (internal_command, alias, is_user_defined)
                VALUES (?, ?, 1)
                """,
                (internal_command, alias),
            )

    command_cache.pop(db_path, None)
    return list_commands(command)


def delete_command_alias(command):
    db_path = command_database_path(command)
    ensure_command_database_once(db_path)
    internal_command = str(command.get("command") or "").strip()
    alias = clean_user_alias(command.get("alias"))

    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            DELETE FROM command_aliases
            WHERE internal_command = ? AND alias = ? AND is_user_defined = 1
            """,
            (internal_command, alias),
        )

    command_cache.pop(db_path, None)
    return list_commands(command)


def normalize_phrase(value):
    value = re.sub(r"\{number\}", " __number__ ", str(value or "").lower())
    value = re.sub(r"[^a-z0-9_\s]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


COMMAND_TOKEN_ALTERNATES = {
    "2": {"2", "two", "to", "too"},
    "two": {"2", "two", "to", "too"},
    "to": {"2", "two", "to", "too"},
    "too": {"2", "two", "to", "too"},
    "4": {"4", "four", "for"},
    "four": {"4", "four", "for"},
    "for": {"4", "four", "for"},
}


def command_tokens_match(pattern_tokens, transcript_tokens):
    if len(pattern_tokens) != len(transcript_tokens):
        return False

    for pattern_token, transcript_token in zip(pattern_tokens, transcript_tokens):
        if pattern_token == transcript_token:
            continue
        if transcript_token in COMMAND_TOKEN_ALTERNATES.get(pattern_token, set()):
            continue
        return False
    return True


def command_number_from_text(value):
    normalized = normalize_phrase(value)
    homophone_numbers = {
        "to": 2,
        "too": 2,
        "for": 4,
    }
    if normalized in homophone_numbers:
        return homophone_numbers[normalized]
    return number_from_text(value)


def parse_under_hundred_number(words):
    if not words:
        return None
    if len(words) == 1:
        word = words[0]
        if word in NUMBER_UNITS:
            return NUMBER_UNITS[word]
        if word in NUMBER_TEENS:
            return NUMBER_TEENS[word]
        if word in NUMBER_TENS:
            return NUMBER_TENS[word]
        return None
    if len(words) == 2 and words[0] in NUMBER_TENS and words[1] in NUMBER_UNITS and NUMBER_UNITS[words[1]] > 0:
        return NUMBER_TENS[words[0]] + NUMBER_UNITS[words[1]]
    return None


def parse_under_thousand_number(words):
    words = [word for word in words if word != "and"]
    if not words:
        return None

    if "hundred" not in words:
        under_hundred = parse_under_hundred_number(words)
        if under_hundred is not None:
            return under_hundred
        if (
            len(words) >= 2
            and words[0] in NUMBER_UNITS
            and NUMBER_UNITS[words[0]] > 0
            and (words[1] in NUMBER_TENS or words[1] in NUMBER_TEENS)
        ):
            rest_value = parse_under_hundred_number(words[1:])
            if rest_value is not None:
                return NUMBER_UNITS[words[0]] * 100 + rest_value
        return None

    hundred_index = words.index("hundred")
    if hundred_index != 1 or words[0] not in NUMBER_UNITS or NUMBER_UNITS[words[0]] == 0:
        return None

    rest = words[hundred_index + 1:]
    rest_value = parse_under_hundred_number(rest) if rest else 0
    if rest_value is None:
        return None
    return NUMBER_UNITS[words[0]] * 100 + rest_value


def number_from_text(value):
    value = str(value or "").lower().strip()
    if value.isdigit():
        return int(value)

    words = normalize_phrase(value).split()
    if not words:
        return None

    total = 0
    remaining = words
    for scale_word, scale in sorted(NUMBER_SCALES.items(), key=lambda item: item[1], reverse=True):
        if scale_word not in remaining:
            continue

        scale_index = remaining.index(scale_word)
        scale_value = parse_under_thousand_number(remaining[:scale_index])
        if scale_value is None or scale_value == 0:
            return None

        total += scale_value * scale
        remaining = remaining[scale_index + 1:]

    rest_value = parse_under_thousand_number(remaining) if remaining else 0
    if rest_value is None:
        return None
    return total + rest_value


def phrase_match(pattern, transcript):
    normalized_pattern = normalize_phrase(pattern)
    normalized_transcript = normalize_phrase(transcript)

    text_variable_match = re.fullmatch(r"(.+?)\s+\{(?:any\s+)?text\}", str(pattern or "").strip(), re.IGNORECASE)
    if text_variable_match:
        prefix = text_variable_match.group(1).strip()
        normalized_prefix = normalize_phrase(prefix)
        if not normalized_prefix or normalized_transcript == normalized_prefix:
            return None
        if not normalized_transcript.startswith(f"{normalized_prefix} "):
            return None

        prefix_pattern = r"^\s*" + r"\s+".join(re.escape(part) for part in prefix.split()) + r"\s+(.+?)\s*$"
        original_match = re.match(prefix_pattern, str(transcript or ""), re.IGNORECASE)
        if original_match:
            text = original_match.group(1).strip()
        else:
            text = normalized_transcript[len(normalized_prefix):].strip()
        return {"text": text} if text else None

    if "__number__" not in normalized_pattern:
        pattern_tokens = normalized_pattern.split()
        transcript_tokens = normalized_transcript.split()
        return {} if command_tokens_match(pattern_tokens, transcript_tokens) else None

    pattern_tokens = normalized_pattern.split()
    transcript_tokens = normalized_transcript.split()
    try:
        number_index = pattern_tokens.index("__number__")
    except ValueError:
        return None

    prefix_tokens = pattern_tokens[:number_index]
    suffix_tokens = pattern_tokens[number_index + 1:]
    if len(transcript_tokens) <= len(prefix_tokens) + len(suffix_tokens):
        return None
    if not command_tokens_match(prefix_tokens, transcript_tokens[:len(prefix_tokens)]):
        return None
    if suffix_tokens and not command_tokens_match(suffix_tokens, transcript_tokens[-len(suffix_tokens):]):
        return None

    number_end = len(transcript_tokens) - len(suffix_tokens) if suffix_tokens else len(transcript_tokens)
    row_number = command_number_from_text(" ".join(transcript_tokens[len(prefix_tokens):number_end]))
    if not row_number or row_number < 1:
        return None
    return {"rowNumber": row_number}


def lookup_command_action(transcript, db_path, current_row_latex=None):
    for command in cached_commands(db_path):
        for phrase in [command["name"], *command["aliases"]]:
            match = phrase_match(phrase, transcript)
            if match is None:
                continue

            if command["command"] == "type-correction":
                return {"type": "type-correction", "text": match.get("text", "")}
            if command["command"] == "type-text":
                text = capitalize_spoken_plain_text(match.get("text", ""), current_row_latex)
                return {"type": "insert", "insertMode": "text", "text": text}
            if command["command"] == "correction":
                return None

            action = {"type": "command", "command": command["command"]}
            action.update(match)
            return action

    return None


def workflow_sections(text):
    sections = {}
    current_key = None
    current_lines = []
    marker_pattern = re.compile(r"^(TRANSCRIPT|ACTION|LATEX|END)\s*:?\s*(.*)$", re.IGNORECASE)

    def commit():
        if current_key:
            sections[current_key] = "\n".join(current_lines).strip()

    for line in (text or "").splitlines():
        match = marker_pattern.match(line.strip())
        if match:
            marker = match.group(1).upper()
            if marker == "END":
                commit()
                current_key = None
                current_lines = []
                break

            commit()
            current_key = marker
            current_lines = [match.group(2)] if match.group(2) else []
            continue

        if current_key:
            current_lines.append(line)

    commit()
    return sections


def normalize_transcription_result(raw_text):
    text = (raw_text or "").strip()
    text = re.sub(r"^```(?:text|plaintext)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    parsed = parse_json_response(text)
    if isinstance(parsed, dict):
        return clean_text(parsed.get("transcript") or parsed.get("verbatimTranscript") or "")

    sections = workflow_sections(text)
    if "TRANSCRIPT" in sections:
        return clean_text(sections.get("TRANSCRIPT", ""))

    return clean_text(re.sub(r"^\s*TRANSCRIPT\s*:\s*", "", text, flags=re.IGNORECASE))


def normalize_latex_workflow_result(raw_text):
    text = (raw_text or "").strip()
    text = re.sub(r"^```(?:text|plaintext)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    sections = workflow_sections(text)
    if "ACTION" in sections or "LATEX" in sections:
        action = normalize_workflow_action(sections.get("ACTION"))
        latex = clean_raw_latex_result(sections.get("LATEX", ""), require_math=True)
        return {"parsed": True, "action": action, "latex": latex}

    match = re.search(
        r"(?:ACTION\s*:\s*(?P<action>[^\r\n]+))?\s*LATEX\s*:\s*(?P<latex>[\s\S]*?)(?:\s*END\s*)?$",
        text,
        flags=re.IGNORECASE,
    )
    if match:
        action = normalize_workflow_action(match.group("action"))
        latex = clean_raw_latex_result(match.group("latex"), require_math=True)
        return {"parsed": True, "action": action, "latex": latex}

    parsed = parse_json_response(text)
    if isinstance(parsed, dict):
        action = normalize_workflow_action(parsed.get("action") or parsed.get("type"))
        latex = parsed.get("latex")
        if latex is not None:
            latex = restore_json_decoded_latex_escapes(latex)
            latex = clean_raw_latex_result(latex, require_math=True)
        return {"parsed": True, "action": action, "latex": latex}

    latex = normalize_latex_result(text)
    if latex and not looks_like_latex_or_math_source(latex):
        latex = None
    return {"parsed": False, "action": "insert", "latex": latex}


def normalize_text_correction_result(raw_text):
    text = (raw_text or "").strip()
    text = re.sub(r"^```(?:text|plaintext)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)
    if is_explanatory_or_apology(text):
        return None

    match = re.search(r"(?:^|\n)\s*TEXT\s*:\s*(?P<text>[\s\S]*?)(?:\n\s*END\s*:?\s*$|$)", text, flags=re.IGNORECASE)
    if match:
        return match.group("text").strip()

    parsed = parse_json_response(text)
    if isinstance(parsed, dict):
        value = parsed.get("text") or parsed.get("rowText") or parsed.get("correctedText")
        if value is not None:
            return str(value).strip()

    text = re.sub(r"(?im)^\s*END\s*:?\s*$", "", text).strip()
    return re.sub(r"^\s*TEXT\s*:\s*", "", text, flags=re.IGNORECASE).strip()


def normalize_latex_result(raw_text):
    relaxed_latex = relaxed_json_string_field(raw_text, "latex")
    if relaxed_latex is not None:
        latex = restore_json_decoded_latex_escapes(relaxed_latex)
        return clean_raw_latex_result(latex)

    parsed = parse_json_response(raw_text)
    if isinstance(parsed, dict):
        latex = parsed.get("latex")
        if latex is None:
            return None

        latex = restore_json_decoded_latex_escapes(latex)
        return clean_raw_latex_result(latex)

    return clean_raw_latex_result(raw_text)


def load_litert_model(command):
    global engine
    global engine_load_command
    global engine_backend_name
    global engine_speculative_decoding
    global engine_runtime

    load_started = time.perf_counter()
    litert_lm = import_litert_lm()

    if engine is not None:
        return {
            "ready": True,
            "backend": engine_backend_name,
            "runtime": engine_runtime,
            "speculativeDecoding": engine_speculative_decoding,
        }

    if hasattr(litert_lm, "set_min_log_severity") and hasattr(litert_lm, "LogSeverity"):
        litert_lm.set_min_log_severity(litert_lm.LogSeverity.ERROR)
    backend_candidates = backend_candidates_from_name(litert_lm, command.get("backend"))
    audio_backend_candidates = backend_candidates_from_name(litert_lm, command.get("audioBackend"))
    max_num_tokens = parse_positive_int(command.get("maxNumTokens"))
    base_kwargs = {}
    cache_dir = command.get("cacheDir")
    if cache_dir:
        base_kwargs["cache_dir"] = cache_dir
    if max_num_tokens:
        base_kwargs["max_num_tokens"] = max_num_tokens

    last_error = None
    selected_backend = None
    selected_speculative_mode = None
    for backend in backend_candidates:
        for audio_backend in audio_backend_candidates:
            for speculative_mode in speculative_modes_for_backend(backend, command):
                kwargs = {
                    **base_kwargs,
                    "backend": backend,
                    "audio_backend": audio_backend,
                }
                apply_speculative_mode(kwargs, speculative_mode)
                try:
                    candidate_engine = litert_lm.Engine(command["modelPath"], **kwargs)
                    if hasattr(candidate_engine, "__enter__"):
                        entered_engine = candidate_engine.__enter__()
                        if entered_engine is not None:
                            candidate_engine = entered_engine
                    engine = candidate_engine
                    selected_backend = backend
                    selected_speculative_mode = speculative_mode
                    break
                except Exception as exc:
                    last_error = exc
                    engine = None
            if engine is not None:
                break
        if engine is not None:
            break

    if engine is None:
        raise last_error or RuntimeError("LiteRT-LM engine could not be loaded.")

    engine_load_command = dict(command)
    engine_backend_name = backend_name(selected_backend)
    engine_runtime = "litert"
    engine_speculative_decoding = selected_speculative_mode or "default"
    result = {
        "ready": True,
        "backend": engine_backend_name,
        "runtime": engine_runtime,
        "speculativeDecoding": engine_speculative_decoding,
    }
    if engine_speculative_decoding != "enabled" and last_error is not None:
        result["speculativeFallbackReason"] = str(last_error)
    log_timing("model-load", load_started, backend=engine_backend_name, speculative=engine_speculative_decoding)
    return result


def load_model(command, emit_progress=None):
    return load_litert_model(command)


def close_engine():
    global engine
    global engine_backend_name
    global engine_speculative_decoding
    global engine_runtime
    if engine is None:
        return

    if engine_runtime == "litert" and hasattr(engine, "__exit__"):
        try:
            engine.__exit__(None, None, None)
        except Exception:
            pass
    elif engine_runtime == "litert" and hasattr(engine, "close"):
        try:
            engine.close()
        except Exception:
            pass
    engine = None
    engine_backend_name = None
    engine_speculative_decoding = None
    engine_runtime = None


def reload_model_on_cpu(force=False):
    global engine_load_command
    global engine_backend_name

    if not engine_load_command:
        return False
    if engine_backend_name == "cpu" and not force:
        return False

    close_engine()
    command = dict(engine_load_command)
    command["backend"] = "cpu"
    command["audioBackend"] = "cpu"
    load_model(command)
    return True


def run_text_correction(correction, current_row_latex=None):
    prompt = build_text_correction_prompt(correction, current_row_latex)
    message = {
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": prompt,
            },
        ],
    }

    response = send_text_correction_message(message)

    corrected_text = normalize_text_correction_result(response)
    if corrected_text is None:
        return None

    return plain_text_to_latex(corrected_text)


def run_transcription(command):
    if engine is None:
        raise RuntimeError("Speech model has not been loaded.")

    total_started = time.perf_counter()
    result_label = "error"
    transcript_message = {
        "role": "user",
        "content": [
            {"type": "audio", "path": command["audioPath"]},
            {
                "type": "text",
                "text": build_transcription_prompt(),
            },
        ],
    }

    try:
        transcript_started = time.perf_counter()
        with engine.create_conversation(automatic_tool_calling=False) as conversation:
            transcript_response = conversation.send_message(transcript_message)
        transcript_response_text = response_text(transcript_response)
        log_timing("transcription-pass", transcript_started)

        transcript = normalize_transcription_result(transcript_response_text)
        if not transcript:
            result_label = "ignore"
            return {"transcript": "", "action": {"type": "ignore"}}

        command_started = time.perf_counter()
        command_action = lookup_command_action(transcript, command_database_path(command), command.get("currentRowLatex"))
        log_timing("command-lookup", command_started)
        if command_action:
            if command_action.get("type") == "type-correction":
                correction_started = time.perf_counter()
                corrected_latex = run_text_correction(command_action.get("text"), command.get("currentRowLatex"))
                log_timing("text-correction-pass", correction_started)
                if corrected_latex is not None:
                    result_label = "replace-row:text-correction"
                    return {"transcript": transcript, "action": {"type": "replace-row", "latex": corrected_latex}}

            result_label = f"command:{command_action.get('command')}"
            return {"transcript": transcript, "action": command_action}

        latex_message = {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": build_latex_workflow_prompt(transcript),
                },
            ],
        }

        latex_started = time.perf_counter()
        latex_response_text = send_latex_workflow_message(latex_message, command.get("currentRowLatex"))
        log_timing("latex-pass", latex_started)

        latex_result = normalize_latex_workflow_result(latex_response_text)
        latex = latex_result["latex"]

        if latex_result["action"] == "replace-row" and latex:
            result_label = "replace-row"
            return {"transcript": transcript, "action": {"type": "replace-row", "latex": latex}}

        if latex:
            result_label = "insert:latex"
            return {"transcript": transcript, "action": {"type": "insert", "insertMode": "latex", "text": latex}}

        result_label = "insert:text"
        return {"transcript": transcript, "action": {"type": "insert", "insertMode": "text", "text": transcript}}
    finally:
        log_timing("total-request", total_started, result=result_label)


def transcribe(command):
    try:
        return run_transcription(command)
    except Exception as first_error:
        if not reload_model_on_cpu(force=True):
            raise

        try:
            return run_transcription(command)
        except Exception as second_error:
            raise RuntimeError(
                f"{second_error} (retry on CPU also failed after initial error: {first_error})"
            ) from second_error


def handle(command, emit_progress=None):
    if command["type"] == "load":
        return load_model(command, emit_progress)
    if command["type"] == "list-commands":
        return list_commands(command)
    if command["type"] == "add-command-alias":
        return add_command_alias(command)
    if command["type"] == "delete-command-alias":
        return delete_command_alias(command)
    if command["type"] == "transcribe":
        return transcribe(command)
    raise ValueError(f"Unknown command type: {command['type']}")


def send(payload):
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        if not line.strip():
            continue

        command = json.loads(line)
        request_id = command.get("id")

        def emit_progress(payload, request_id=request_id):
            if request_id is None:
                return
            send({"id": request_id, "progress": payload})

        try:
            send({"id": request_id, "ok": True, "result": handle(command, emit_progress)})
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            send({"id": request_id, "ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
