import json
import re
import sys
import traceback


PROMPT_TEMPLATE = """
Transcribe what you hear in the audio into Latex.
"""

# Current row LaTeX:
# {current_row_latex}


engine = None


def backend_from_name(litert_lm, name):
    normalized = str(name or "cpu").upper()
    return getattr(litert_lm.Backend, normalized, litert_lm.Backend.CPU)


def clean_text(value):
    value = re.sub(r"<[^>]+>", " ", value or "")
    value = value.replace("```latex", "").replace("```", "")
    value = re.sub(r"\s+", " ", value)
    return value.strip().strip('"')


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


def load_model(command):
    global engine

    import litert_lm

    if engine is not None:
        return {"ready": True}

    if hasattr(litert_lm, "set_min_log_severity") and hasattr(litert_lm, "LogSeverity"):
        litert_lm.set_min_log_severity(litert_lm.LogSeverity.ERROR)
    kwargs = {
        "backend": backend_from_name(litert_lm, command.get("backend")),
        "audio_backend": backend_from_name(litert_lm, command.get("audioBackend")),
    }
    cache_dir = command.get("cacheDir")
    if cache_dir:
        kwargs["cache_dir"] = cache_dir

    engine = litert_lm.Engine(command["modelPath"], **kwargs)
    if hasattr(engine, "__enter__"):
        entered_engine = engine.__enter__()
        if entered_engine is not None:
            engine = entered_engine
    return {"ready": True}


def transcribe(command):
    if engine is None:
        raise RuntimeError("LiteRT-LM engine has not been loaded.")

    message = {
        "role": "user",
        "content": [
            {"type": "audio", "path": command["audioPath"]},
            {
                "type": "text",
                "text": PROMPT_TEMPLATE.format(
                    current_row_latex=command.get("currentRowLatex") or "(empty)"
                ),
            },
        ],
    }

    with engine.create_conversation() as conversation:
        response = conversation.send_message(message)

    return {"transcript": clean_text(response_text(response))}


def handle(command):
    if command["type"] == "load":
        return load_model(command)
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
        try:
            send({"id": command["id"], "ok": True, "result": handle(command)})
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            send({"id": command.get("id"), "ok": False, "error": str(exc)})


if __name__ == "__main__":
    main()
