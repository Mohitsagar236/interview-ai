import re
from dataclasses import dataclass
from typing import List, Optional, Dict

# Lazy loaded
PdfReader = None
docx = None

@dataclass
class ParsedResume:
    name: str
    text: str
    chunks: List[str]
    metadata: Dict[str, str]

CHUNK_TARGET = 500

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+\d{1,3}[\s-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s-]?\d{3,4}[\s-]?\d{3,4}")
URL_RE = re.compile(r"https?://\S+")


def extract_text(name: str, raw: bytes) -> str:
    global PdfReader, docx
    import io

    lower = name.lower()
    if lower.endswith('.pdf'):
        if PdfReader is None:
            try:
                from pypdf import PdfReader
            except ImportError:
                pass

    if lower.endswith('.docx'):
        if docx is None:
            try:
                import docx
            except ImportError:
                pass

    if lower.endswith('.pdf') and PdfReader:
        try:
            reader = PdfReader.from_bytes(raw) if hasattr(PdfReader, 'from_bytes') else PdfReader(io.BytesIO(raw))  # type: ignore
        except Exception:
            reader = PdfReader(io.BytesIO(raw))  # type: ignore
        txt = []
        for page in reader.pages:  # type: ignore
            try:
                txt.append(page.extract_text() or '')
            except Exception:
                pass
        return '\n'.join(txt)
    if lower.endswith('.docx') and docx:
        try:
            document = docx.Document(io.BytesIO(raw))  # type: ignore
            return '\n'.join(p.text for p in document.paragraphs)
        except Exception:
            return raw.decode('utf-8', errors='ignore')
    # Plain text fallback
    try:
        return raw.decode('utf-8', errors='ignore')
    except Exception:
        return ''


def normalize_text(text: str) -> str:
    text = text.replace('\r', '')
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def chunk_text(text: str, target: int = CHUNK_TARGET) -> List[str]:
    paras = [p.strip() for p in text.split('\n\n') if p.strip()]
    chunks: List[str] = []
    buf: List[str] = []
    size = 0
    for p in paras:
        if size + len(p) + 1 > target and buf:
            chunks.append('\n'.join(buf))
            buf, size = [], 0
        buf.append(p)
        size += len(p) + 1
    if buf:
        chunks.append('\n'.join(buf))
    return chunks or [text]


def extract_metadata(text: str) -> Dict[str, str]:
    md: Dict[str,str] = {}
    email = EMAIL_RE.search(text)
    if email: md['email'] = email.group(0)
    phone = PHONE_RE.search(text)
    if phone: md['phone'] = phone.group(0)
    urls = URL_RE.findall(text)
    if urls: md['urls'] = ', '.join(urls[:5])
    # Very naive name guess: first non-empty line with 2-4 words, capitalized
    for line in text.splitlines():
        line = line.strip()
        if 4 <= len(line) <= 60 and 1 < line.count(' ') <= 5 and line.split(' ')[0][0].isupper():
            md['candidate_name_guess'] = line
            break
    return md


def parse_resume(name: str, raw: bytes) -> ParsedResume:
    text = extract_text(name, raw)
    norm = normalize_text(text)
    chunks = chunk_text(norm)
    meta = extract_metadata(norm)
    return ParsedResume(name=name, text=norm, chunks=chunks, metadata=meta)

if __name__ == '__main__':  # simple manual test
    sample = b"John Doe\nSoftware Engineer\nEmail: john@example.com\nExperience..."
    pr = parse_resume('sample.txt', sample)
    print(pr)
