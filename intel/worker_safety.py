"""
The worker's interior safety.

The worker is the platform's boundary, but inside that boundary it runs
tools. Two things can go wrong in a subprocess call, and neither is
shell injection — there is no shell here — so the usual defence is the
wrong one:

  * **Option injection.** A subprocess is given an argument vector, and
    the program reads that vector. A value that begins with a dash is an
    option to the program, not an argument to it. Passing a target of
    ``-oG=/etc/passwd`` to nmap writes a file, and passing a query of
    ``--help`` to searchsploit does something else entirely. Every value
    that comes from a request has to be checked before it reaches an
    argument vector.

  * **Unbounded output.** ``capture_output=True`` with no limit lets a
    program that prints without end take the worker's memory with it. The
    output is read through a cap, and the program is killed when it
    exceeds it.

There is a third, in the worker's own Python rather than in a
subprocess: a file name taken from an upload is a path, and a path can
walk out of the directory it was supposed to stay in.
"""

import os
import re
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

# A control character in an argument is not a value; it is a way to
# rewrite a terminal, a log, or a header. None of them are needed.
_CONTROL = re.compile(r'[\x00-\x1f\x7f]')

# The longest a single argument may be. Every real value here — a host, a
# port range, a CVE, a search phrase — is far shorter.
MAX_ARG_LEN = 512

# The most output the worker will read from one program, in bytes.
MAX_OUTPUT_BYTES = 8 * 1024 * 1024

# How long one program may run.
DEFAULT_TIMEOUT_SECONDS = 120


class UnsafeArgument(ValueError):
    """A value from a request that may not be used as an argument."""


class OutputTooLarge(RuntimeError):
    """A program printed more than the worker will read."""


def safe_arg(value, name: str = "argument") -> str:
    """
    Check a value that is about to become a subprocess argument.

    A dash at the start is the important case: that is how an argument
    becomes an option. Everything else here is belt and braces, but the
    belt is cheap and the braces are not.
    """
    if value is None:
        raise UnsafeArgument(f"{name} is required")
    if not isinstance(value, str):
        raise UnsafeArgument(f"{name} must be a string")
    if not value:
        raise UnsafeArgument(f"{name} is empty")
    if len(value) > MAX_ARG_LEN:
        raise UnsafeArgument(f"{name} is too long")
    if _CONTROL.search(value):
        raise UnsafeArgument(f"{name} contains control characters")
    if value.startswith('-'):
        raise UnsafeArgument(f"{name} may not begin with a dash")
    return value


def safe_int(value, name: str = "value", low: int = 0, high: int = 65535) -> int:
    """Check a number that is about to become a subprocess argument."""
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise UnsafeArgument(f"{name} must be a number")
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise UnsafeArgument(f"{name} must be a number")
    if n < low or n > high:
        raise UnsafeArgument(f"{name} is out of range")
    return n


def safe_port_range(value, name: str = "ports") -> str:
    """
    Check a port specification.

    A port range is a list of numbers and dashes, and nothing else. The
    usual way this goes wrong is a target that starts with a dash.
    """
    if not isinstance(value, str) or not value:
        raise UnsafeArgument(f"{name} is required")
    if len(value) > MAX_ARG_LEN:
        raise UnsafeArgument(f"{name} is too long")
    if _CONTROL.search(value):
        raise UnsafeArgument(f"{name} contains control characters")
    if value.startswith('-'):
        raise UnsafeArgument(f"{name} may not begin with a dash")
    if not re.fullmatch(r'[0-9,\- ]+', value):
        raise UnsafeArgument(f"{name} must be a list of ports")
    return value


def safe_target(value, name: str = "target") -> str:
    """
    Check a network target.

    A target is a host, an address, or a CIDR block. It is not an
    option, and it is not a file.
    """
    if not isinstance(value, str) or not value:
        raise UnsafeArgument(f"{name} is required")
    if len(value) > MAX_ARG_LEN:
        raise UnsafeArgument(f"{name} is too long")
    if _CONTROL.search(value):
        raise UnsafeArgument(f"{name} contains control characters")
    if value.startswith('-'):
        raise UnsafeArgument(f"{name} may not begin with a dash")
    if '/' in value:
        # A CIDR block, and nothing else with a slash.
        if not re.fullmatch(r'[0-9a-fA-F:.]+/\d{1,3}', value):
            raise UnsafeArgument(f"{name} is not a valid address block")
        return value
    if not re.fullmatch(r'[A-Za-z0-9._:-]+', value):
        raise UnsafeArgument(f"{name} is not a valid host")
    return value


def safe_url(value, name: str = "url") -> str:
    """Check a URL that is about to be handed to a program as an argument."""
    if not isinstance(value, str) or not value:
        raise UnsafeArgument(f"{name} is required")
    if len(value) > 2048:
        raise UnsafeArgument(f"{name} is too long")
    if _CONTROL.search(value):
        raise UnsafeArgument(f"{name} contains control characters")
    if value.startswith('-'):
        raise UnsafeArgument(f"{name} may not begin with a dash")
    if not re.match(r'^https?://', value):
        raise UnsafeArgument(f"{name} must be an http or https URL")
    return value


def safe_filename_component(value, name: str = "filename") -> str:
    """
    Check one component of a file name.

    A component is a name, not a path: no separator, no parent
    reference, nothing that could walk out of the directory it belongs
    in.
    """
    if not isinstance(value, str) or not value:
        raise UnsafeArgument(f"{name} is required")
    if len(value) > 200:
        raise UnsafeArgument(f"{name} is too long")
    if _CONTROL.search(value):
        raise UnsafeArgument(f"{name} contains control characters")
    if value in ('.', '..'):
        raise UnsafeArgument(f"{name} is not a usable name")
    if '/' in value or '\\' in value or os.sep in value:
        raise UnsafeArgument(f"{name} may not contain a path separator")
    if not re.fullmatch(r'[A-Za-z0-9._-]+', value):
        raise UnsafeArgument(f"{name} has unsupported characters")
    return value


def run_tool(
    argv: Sequence[str],
    timeout: int = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int = MAX_OUTPUT_BYTES,
    cwd: Optional[str] = None,
    env: Optional[dict] = None,
) -> Tuple[int, str, str]:
    """
    Run a program with a bounded output and a bounded lifetime.

    The output is read as it arrives, not collected at the end: a program
    that prints without end is stopped the moment it passes the cap,
    rather than being allowed to fill the worker's memory until its
    timeout runs out. The program is killed in that case, and the
    exception says so.

    The environment is the scrubbed one unless another is given, so the
    platform's own secret is not handed to a program it did not write.
    """
    try:
        proc = subprocess.Popen(
            list(argv),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=cwd,
            env=env if env is not None else safe_environment(),
        )
    except FileNotFoundError:
        raise

    stdout_chunks: List[bytes] = []
    stderr_chunks: List[bytes] = []
    stdout_len = 0
    stderr_len = 0
    overflow = False

    def drain(stream, sink):
        """
        Read a pipe into the sink, and stop the program at the cap.

        The kill matters: a program that prints without end fills the
        pipe and then blocks on the write, so waiting for it to exit
        would wait forever. It is stopped the moment it passes the cap.
        """
        nonlocal overflow
        total = 0
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                overflow = True
                try:
                    proc.kill()
                except Exception:
                    pass
                break
            sink.append(chunk)

    out_thread = threading.Thread(
        target=drain, args=(proc.stdout, stdout_chunks), daemon=True)
    err_thread = threading.Thread(
        target=drain, args=(proc.stderr, stderr_chunks), daemon=True)
    out_thread.start()
    err_thread.start()

    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        out_thread.join(timeout=5)
        err_thread.join(timeout=5)
        raise subprocess.TimeoutExpired(list(argv), timeout)

    out_thread.join(timeout=5)
    err_thread.join(timeout=5)

    if overflow:
        raise OutputTooLarge(
            f"the program printed more than {max_bytes} bytes"
        )

    return (
        proc.returncode,
        b"".join(stdout_chunks).decode('utf-8', errors='replace'),
        b"".join(stderr_chunks).decode('utf-8', errors='replace'),
    )


def safe_temp_path(prefix: str, suffix: str = '') -> Path:
    """
    A temporary file path the worker owns.

    The name is generated rather than taken from anything, so it cannot
    point outside the temporary directory.
    """
    import secrets
    name = f"{prefix}{secrets.token_hex(8)}{suffix}"
    return Path(tempfile.gettempdir()) / name


def safe_upload_path(original_name: str, prefix: str = 'osiris-upload-') -> Path:
    """
    Where an uploaded file is written.

    The name from the upload is checked and then *not used*: the file
    lands under a name the worker generated, so the name a client chose
    can neither escape the directory nor collide with another upload.
    """
    # The name is still checked, so an obviously hostile one is refused
    # rather than quietly rewritten.
    if original_name:
        try:
            safe_filename_component(Path(original_name).name, "filename")
        except UnsafeArgument:
            pass  # a hostile name is replaced, not obeyed
    return safe_temp_path(prefix, Path(original_name or '').suffix[:16])


# ── The environment a tool or a program is given ──────────────────────────
#
# A subprocess inherits its parent's environment by default. The worker's
# environment holds the shared secret the platform and the worker use to
# recognise each other, and a tool that reads it and sends it somewhere
# breaks the boundary the secret exists to make.
#
# So the environment is built from an allowlist rather than inherited.
# The variables below are the ones a tool or a program legitimately needs:
# the search path, the system directories, the temporary directory, and the
# API keys the tools themselves were written to use. The worker's own secret
# is not among them and never will be.

SAFE_ENV_VARS = (
    # The search path, and the system directories Windows needs to find
    # anything at all.
    'PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir',
    'SystemDrive', 'COMSPEC', 'ProgramFiles', 'ProgramFiles(x86)',
    'ProgramData',
    # The user's own directories and the temporary directory.
    'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
    'TMPDIR',
    # Locale, and the two that keep a tool's output readable.
    'LANG', 'LC_ALL', 'LC_CTYPE', 'PYTHONIOENCODING', 'PYTHONUNBUFFERED',
    # The API keys the collection's own tools were written to use. These
    # belong to the operator, not to the platform.
    'SHODAN_API_KEY', 'OPENROUTER_API_KEY', 'OPENCELLID_KEY',
    'BROADCASTIFY_API_KEY', 'HIBF_API_KEY', 'DEFLOCK_CATALOG_URL',
    'OSIRIS_MODELS_DIR', 'WIFITE_BIN', 'WIFITE_VARIANT',
)

# The worker's own secret, and anything else that looks like one. The
# allowlist already excludes it; this is the belt to the allowlist's braces.
NEVER_INHERIT = (
    'OSIRIS_WORKER_KEY',
    'OSIRIS_PLATFORM_URL',
    'DATABASE_URL',
    'POSTGRES_PASSWORD',
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
)


def safe_environment(source: Optional[dict] = None) -> dict:
    """
    The environment a tool or a program is given.

    Built from an allowlist, not inherited. A tool that wants a key it was
    written to use gets it; a tool that wants the platform's own secret
    does not, because the secret is not in the list and never will be.
    """
    env = source if source is not None else os.environ
    out = {}
    for name in SAFE_ENV_VARS:
        value = env.get(name)
        if value is not None:
            out[name] = value
    # Nothing on the never-inherit list is carried, whatever else happens.
    for name in NEVER_INHERIT:
        out.pop(name, None)
    return out

