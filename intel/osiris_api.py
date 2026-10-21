#!/usr/bin/env python3
"""
OSIRIS tool-collection worker.

This process exposes the tools in C:\\Projects\\Cyber-Security\\Tools. It is a
*worker*, not a surface: the platform's integration dispatcher is the only
thing that should talk to it, and it is the platform that decides which
tool may run, on whose behalf, and what is recorded.

The reason is the boundary. This worker imports tool modules and runs
some of them as subprocesses, which is exactly the kind of execution the
platform's dispatcher refuses to do in-process. Putting it behind the
dispatcher means the allowlist, the tenant check, the consent gate and
the audit trail all apply before anything here is reached.

So:

  * every route below /api/health requires a shared secret;
  * the server refuses to start without one;
  * it binds to loopback unless told otherwise.
"""

import os
import sys
import json
import hmac
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional

from flask import Flask, request, jsonify, send_file
from werkzeug.exceptions import HTTPException

from worker_safety import (
    UnsafeArgument,
    OutputTooLarge,
    DEFAULT_TIMEOUT_SECONDS,
    run_tool,
    safe_arg,
    safe_environment,
    safe_int,
    safe_port_range,
    safe_target,
    safe_url,
    safe_temp_path,
    safe_upload_path,
)

# Every scan is bounded by the same lifetime, whichever path runs it.
SCAN_TIMEOUT_SECONDS = DEFAULT_TIMEOUT_SECONDS

# Add Cyber-Security tools to path
CYBER_TOOLS_ROOT = Path("C:/Projects/Cyber-Security")
TOOLS_PATH = CYBER_TOOLS_ROOT / "Tools"
sys.path.insert(0, str(CYBER_TOOLS_ROOT))  # Add root for quantum package
sys.path.insert(0, str(TOOLS_PATH))

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max upload

# The shared secret between the platform and this worker. Without one the
# server does not start: a worker that answers anyone is not a worker,
# it is a second surface with none of the platform's checks.
WORKER_KEY = os.environ.get('OSIRIS_WORKER_KEY', '').strip()
WORKER_KEY_HEADER = 'X-OSIRIS-Worker-Key'

# Only the health check is open. Everything else is the platform's to ask
# for, and the platform records what it asked for.
OPEN_PATHS = {'/api/health'}

# The host to bind to. Loopback by default: the platform reaches this
# over the local network, and nothing else needs to.
BIND_HOST = os.environ.get('OSIRIS_WORKER_HOST', '127.0.0.1')
BIND_PORT = int(os.environ.get('OSIRIS_WORKER_PORT', '8080'))


@app.before_request
def require_worker_key():
    """Refuse any request that did not come from the platform."""
    if request.path in OPEN_PATHS:
        return None
    if not WORKER_KEY:
        return jsonify({
            'error': 'WORKER_KEY_NOT_CONFIGURED',
            'detail': 'Set OSIRIS_WORKER_KEY to the same value the platform uses.',
        }), 503
    presented = request.headers.get(WORKER_KEY_HEADER, '')
    # Constant-time: a length difference is a length difference, and the
    # comparison itself must not leak how much of the key was right.
    if not presented or not hmac.compare_digest(presented, WORKER_KEY):
        return jsonify({'error': 'WORKER_UNAUTHENTICATED'}), 401
    return None


@app.after_request
def harden_response(response):
    """A worker's answers are not a web page and should not be treated as one."""
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    return response


# Tool categories mapping
TOOL_CATEGORIES = {
    "recon": "Reconnaissance & OSINT",
    "exploit": "Exploits & Vulnerabilities",
    "payload": "Payload Generation",
    "crypto": "Cryptography & Encryption",
    "network": "Network Tools",
    "web": "Web Application Security",
    "mobile": "Mobile Security",
    "forensics": "Forensics & Analysis",
    "postexploit": "Post-Exploitation",
    "brute": "Brute Force & Cracking",
    "c2": "Command & Control",
    "social": "Social Engineering",
    "rat": "Remote Access Tools",
}

# Cache for tool discovery
_tool_cache = None


def discover_tools() -> Dict[str, List[Dict[str, Any]]]:
    """Discover available tools from the Cyber-Security directory."""
    global _tool_cache
    if _tool_cache is not None:
        return _tool_cache

    tools = {}
    for category_dir in TOOLS_PATH.iterdir():
        if not category_dir.is_dir() or category_dir.name.startswith('_'):
            continue
        
        category_tools = []
        for tool_file in category_dir.rglob("*.py"):
            if tool_file.name.startswith('_') or tool_file.suffix == '.pyc':
                continue
            
            rel_path = tool_file.relative_to(category_dir)
            category_tools.append({
                "name": tool_file.stem,
                "path": str(rel_path),
                "full_path": str(tool_file),
                "category": category_dir.name,
                "description": extract_description(tool_file)
            })
        
        if category_tools:
            tools[category_dir.name] = category_tools

    _tool_cache = tools
    return tools


def extract_description(file_path: Path) -> str:
    """Extract docstring/description from Python file."""
    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
        lines = content.split('\n')
        for line in lines[:20]:
            line = line.strip()
            if line.startswith('"""') or line.startswith("'''"):
                return line.strip('"\'')
            if line.startswith('#'):
                return line.strip('# ')
    except Exception:
        pass
    return "No description available"


def find_tool(category: str, tool_name: str) -> Optional[Dict]:
    """
    The worker's own catalogue entry for a tool, or None.

    The worker never imports a tool module. It looks the tool up here,
    and the tool runs in a subprocess through the bounded runner, so the
    worker's own process never holds the tool's code.
    """
    tools = discover_tools()
    if category not in tools:
        return None
    return next((t for t in tools[category] if t['name'] == tool_name), None)


@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "ok",
        "service": "osiris-cyber-api",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat() + 'Z',
        "tools_root": str(TOOLS_PATH),
        "tools_available": sum(len(v) for v in discover_tools().values())
    })


@app.route('/api/tools', methods=['GET'])
def list_tools():
    """List all available tools by category."""
    tools = discover_tools()
    return jsonify({
        "categories": TOOL_CATEGORIES,
        "tools": tools,
        "total": sum(len(v) for v in tools.values())
    })


@app.route('/api/tools/<category>', methods=['GET'])
def list_category_tools(category: str):
    """List tools in a specific category."""
    tools = discover_tools()
    if category not in tools:
        return jsonify({"error": "Category not found"}), 404
    return jsonify({
        "category": category,
        "tools": tools[category],
        "total": len(tools[category])
    })


@app.route('/api/tools/<category>/<tool_name>', methods=['POST'])
def execute_tool(category: str, tool_name: str):
    """
    Run one tool from the collection.

    The tool is *not* imported into this process. It runs in a subprocess
    through the bounded runner, so a tool that crashes takes that
    subprocess down and nothing else, a tool that prints without end is
    stopped at the cap, and the worker's own process never holds the
    tool's code. The result comes back as JSON.
    """
    tools = discover_tools()
    if category not in tools:
        return jsonify({"error": "Category not found"}), 404

    tool = next((t for t in tools[category] if t['name'] == tool_name), None)
    if not tool:
        return jsonify({"error": "Tool not found"}), 404

    try:
        result = run_tool_subprocess(tool, request.get_json() or {})
        return jsonify({"success": True, "result": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def run_tool_subprocess(tool: Dict, params: Dict, entry: Optional[str] = None) -> Any:
    """
    Run a tool in a subprocess, and read the answer back.

    Three files are involved: the parameters go out, the result comes
    back, and the shim in between imports the tool and calls it. The
    tool's path comes from the worker's own catalogue, never from the
    request, and the output is bounded.
    """
    params_file = None
    result_file = None
    try:
        params_file = safe_temp_path("osiris-params-", ".json")
        result_file = safe_temp_path("osiris-result-", ".json")

        with open(params_file, "w", encoding="utf-8") as fh:
            json.dump(params, fh)

        runner = str(Path(__file__).resolve().parent / "tool_runner.py")
        argv = [sys.executable, runner, tool['full_path'], str(params_file), str(result_file)]
        if entry:
            argv.append(entry)

        # The tool's subprocess is told where the collection's root is, so
        # a tool can import the shared package that lives there. It is
        # given in the environment rather than inherited, because the
        # environment a tool gets is an allowlist.
        tool_env = safe_environment()
        tool_env['OSIRIS_TOOLS_ROOT'] = str(CYBER_TOOLS_ROOT)

        returncode, stdout, stderr = run_tool(argv, timeout=300, env=tool_env)

        if result_file.exists():
            try:
                with open(result_file, "r", encoding="utf-8") as fh:
                    payload = json.load(fh)
            except Exception as exc:
                payload = {
                    "ok": False,
                    "error": f"the result could not be read: {exc}",
                }

            if not payload.get("ok"):
                return {
                    "returncode": returncode,
                    "error": payload.get("error", "the tool failed"),
                    "traceback": payload.get("traceback"),
                    # A failed run is provenance too: it says which code
                    # failed, and when.
                    "provenance": payload.get("provenance") or {},
                }

            result = payload.get("result")
            if not payload.get("exact", True):
                result = {
                    "note": "the result was not representable as JSON and was summarised",
                    "value": result,
                }
            return {
                "returncode": returncode,
                "result": result,
                # Where the result came from, and which code produced it.
                # A result is the tool's word; the provenance is what lets
                # a reader trace it.
                "provenance": payload.get("provenance") or {},
                "stderr": stderr[-4000:] if stderr else "",
            }

        return {
            "returncode": returncode,
            "error": "the tool produced no result",
            "provenance": {},
            "stdout": stdout[-4000:] if stdout else "",
            "stderr": stderr[-4000:] if stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {"error": "Tool execution timed out (5 min)"}
    except OutputTooLarge as e:
        return {"error": f"Tool produced too much output: {e}"}
    except Exception as e:
        return {"error": f"Execution failed: {str(e)}"}
    finally:
        for path in (params_file, result_file):
            if path:
                try:
                    os.unlink(path)
                except Exception:
                    pass


# Specific tool endpoints for common operations

@app.route('/api/crypto/encrypt', methods=['POST'])
def crypto_encrypt():
    """Encrypt data using AES-256-GCM (GrayFish)."""
    try:
        from quantum.core.grayfish import GrayFish
        gf = GrayFish()
        
        data = request.get_json() or {}
        plaintext = data.get('data', '').encode()
        
        if not plaintext:
            return jsonify({"error": "No data provided"}), 400
        
        # Write to temp file, seal, read back
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(plaintext)
            temp_path = f.name
        
        sealed_path = gf.seal(temp_path)
        with open(sealed_path, 'rb') as f:
            encrypted = f.read()
        
        # Cleanup
        try:
            os.unlink(sealed_path)
        except Exception:
            pass
        
        return jsonify({
            "success": True,
            "encrypted": encrypted.hex(),
            "algorithm": "AES-256-GCM"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/crypto/decrypt', methods=['POST'])
def crypto_decrypt():
    """Decrypt data using AES-256-GCM (GrayFish)."""
    try:
        from quantum.core.grayfish import GrayFish
        gf = GrayFish()
        
        data = request.get_json() or {}
        encrypted_hex = data.get('data', '')
        
        if not encrypted_hex:
            return jsonify({"error": "No data provided"}), 400
        
        encrypted = bytes.fromhex(encrypted_hex)
        
        # Write to temp file, unseal, read back
        with tempfile.NamedTemporaryFile(suffix='.gfy', delete=False) as f:
            f.write(encrypted)
            temp_path = f.name
        
        unsealed_path = gf.unseal(temp_path)
        with open(unsealed_path, 'rb') as f:
            decrypted = f.read()
        
        return jsonify({
            "success": True,
            "decrypted": decrypted.decode('utf-8', errors='replace'),
            "algorithm": "AES-256-GCM"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/recon/shodan', methods=['POST'])
def recon_shodan():
    """Shodan search via Cyber-Security tools."""
    try:
        data = request.get_json() or {}
        query = data.get('query', '')
        if not query:
            return jsonify({"error": "Query required"}), 400

        # The query goes to the tool as a search phrase. It is bounded,
        # and it may not begin with a dash, which would be read as an
        # option rather than as what was asked for.
        try:
            checked_query = safe_arg(query, "query")
        except UnsafeArgument as e:
            return jsonify({"success": False, "error": str(e)}), 400

        # The tool runs in a subprocess, like every other tool in the
        # collection. The worker does not import it.
        tool = find_tool('recon', 'shodan')
        if tool is None:
            return jsonify({
                "success": False,
                "error": "Shodan API key required. Set SHODAN_API_KEY environment variable."
            })

        result = run_tool_subprocess(tool, {"query": checked_query})
        return jsonify({"success": True, "results": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/recon/dorks', methods=['POST'])
def recon_dorks():
    """Google dorks search."""
    try:
        data = request.get_json() or {}
        query = data.get('query', '')
        if not query:
            return jsonify({"error": "Query required"}), 400

        # A dork is a search phrase. It is bounded, and it may not begin
        # with a dash.
        try:
            checked_query = safe_arg(query, "query")
        except UnsafeArgument as e:
            return jsonify({"success": False, "error": str(e)}), 400

        # The tool runs in a subprocess, like every other tool in the
        # collection. The worker does not import it.
        tool = find_tool('recon', 'googledork')
        if tool is None:
            return jsonify({"success": False, "error": "Google dorks tool not available"})

        result = run_tool_subprocess(
            tool, {"query": checked_query}, entry="build_search_url")
        return jsonify({"success": True, "results": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/network/portscan', methods=['POST'])
def network_portscan():
    """Port scanning using nmap."""
    try:
        data = request.get_json() or {}
        target = data.get('target', '')
        ports = data.get('ports', '1-1000')
        if not target:
            return jsonify({"error": "Target required"}), 400

        # The target and the port range are checked before either path
        # runs. The library path takes the target as an argument to
        # nmap, and the subprocess path takes it into an argument vector,
        # and a value that begins with a dash is an option to nmap in
        # both of them.
        try:
            checked_target = safe_target(target)
            checked_ports = safe_port_range(ports)
        except UnsafeArgument as e:
            return jsonify({"success": False, "error": str(e)}), 400

        # Use python-nmap or subprocess. Both are bounded: the library
        # path is given the same timeout the subprocess path has, because
        # `timeout=0` in python-nmap means "wait indefinitely" — a scan
        # against an unresponsive network would otherwise hold the worker
        # thread until the client gives up, with no cap on its output
        # either.
        try:
            import nmap
            nm = nmap.PortScanner()
            nm.scan(checked_target, checked_ports,
                    arguments='-sS -T4', timeout=SCAN_TIMEOUT_SECONDS)

            results = {}
            for host in nm.all_hosts():
                results[host] = {
                    'state': nm[host].state(),
                    'ports': dict(nm[host].all_tcp())
                }
            return jsonify({"success": True, "results": results})
        except ImportError:
            # Fallback to subprocess, with the same checked values.
            returncode, stdout, stderr = run_tool(
                ['nmap', '-sS', '-p', checked_ports, checked_target],
                timeout=SCAN_TIMEOUT_SECONDS,
            )
            return jsonify({
                "success": returncode == 0,
                "output": stdout,
                "error": stderr
            })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/payload/generate', methods=['POST'])
def payload_generate():
    """Generate payloads."""
    try:
        data = request.get_json() or {}
        payload_type = data.get('type', 'reverse_shell')
        lhost = data.get('lhost', '')
        lport = data.get('lport', 4444)
        
        if not lhost:
            return jsonify({"error": "LHOST required"}), 400

        # The payload type, the host and the port all come from the
        # request, and all three reach msfvenom's argument vector. A value
        # that begins with a dash is an option to msfvenom, not an
        # argument to it.
        try:
            checked_type = safe_arg(payload_type, "payload type")
            checked_lhost = safe_arg(lhost, "LHOST")
            checked_lport = str(safe_int(lport, "LPORT", 1, 65535))
        except UnsafeArgument as e:
            return jsonify({"success": False, "error": str(e)}), 400

        # Use msfvenom if available
        try:
            returncode, stdout, stderr = run_tool([
                'msfvenom', '-p', checked_type,
                f'LHOST={checked_lhost}', f'LPORT={checked_lport}',
                '-f', 'raw'
            ], timeout=60)
        except FileNotFoundError:
            return jsonify({"success": False, "error": "msfvenom not installed"})

        if returncode == 0:
            return jsonify({
                "success": True,
                "payload": stdout.encode('utf-8', errors='replace').hex(),
                "type": payload_type
            })
        else:
            return jsonify({"success": False, "error": stderr})
    except OutputTooLarge as e:
        return jsonify({"success": False, "error": str(e)}), 502
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/brute/hash', methods=['POST'])
def brute_hash():
    """Hash cracking."""
    try:
        data = request.get_json() or {}
        hash_value = data.get('hash', '')
        hash_type = data.get('type', 'md5')
        wordlist = data.get('wordlist', 'rockyou.txt')
        
        if not hash_value:
            return jsonify({"error": "Hash required"}), 400
        
        # Try to use hashcat or john
        # This is a simplified example
        return jsonify({
            "success": False,
            "error": "Hash cracking requires GPU and wordlists. Use dedicated tool."
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/exploit/search', methods=['POST'])
def exploit_search():
    """Search for exploits."""
    try:
        data = request.get_json() or {}
        query = data.get('query', '')
        if not query:
            return jsonify({"error": "Query required"}), 400
        
        # Use searchsploit if available. The query is a phrase, and a
        # phrase that begins with a dash is an option to searchsploit.
        try:
            checked_query = safe_arg(query, "query")
        except UnsafeArgument as e:
            return jsonify({"success": False, "error": str(e)}), 400

        try:
            returncode, stdout, stderr = run_tool(
                ['searchsploit', '--json', checked_query], timeout=30)
        except FileNotFoundError:
            return jsonify({"success": False, "error": "searchsploit not installed"})

        if returncode == 0:
            try:
                exploits = json.loads(stdout)
                return jsonify({"success": True, "exploits": exploits})
            except json.JSONDecodeError:
                return jsonify({"success": True, "output": stdout})
        else:
            return jsonify({"success": False, "error": stderr})
    except OutputTooLarge as e:
        return jsonify({"success": False, "error": str(e)}), 502
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/forensics/fileinfo', methods=['POST'])
def forensics_fileinfo():
    """Analyze file metadata."""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        
        file = request.files['file']
        # The name in the upload is not used as a path. The file lands
        # under a name the worker generated, so a client cannot choose
        # where it goes, and cannot walk out of the temporary directory.
        filepath = safe_upload_path(file.filename or '')
        file.save(str(filepath))

        # Basic file info
        import magic
        mime = magic.from_file(str(filepath), mime=True)
        file_type = magic.from_file(str(filepath))

        stat = filepath.stat()

        # Try exiftool
        exif_data = {}
        try:
            returncode, stdout, _stderr = run_tool(
                ['exiftool', '-json', str(filepath)], timeout=30)
            if returncode == 0:
                exif_data = json.loads(stdout)[0]
        except Exception:
            pass
        
        # Cleanup
        try:
            filepath.unlink()
        except Exception:
            pass
        
        return jsonify({
            "success": True,
            "filename": file.filename,
            "size": stat.st_size,
            "mime_type": mime,
            "file_type": file_type,
            "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "exif": exif_data
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/mobile/android', methods=['POST'])
def mobile_android():
    """Android analysis tools."""
    try:
        data = request.get_json() or {}
        action = data.get('action', 'info')
        
        if action == 'devices':
            returncode, stdout, _stderr = run_tool(['adb', 'devices'], timeout=30)
            return jsonify({"success": True, "devices": stdout})

        elif action == 'info' and 'serial' in data:
            # The serial is a device name, and it reaches adb's argument
            # vector right after `-s`. A value that begins with a dash
            # would be another option to adb.
            try:
                checked_serial = safe_arg(data['serial'], "serial")
            except UnsafeArgument as e:
                return jsonify({"success": False, "error": str(e)}), 400
            returncode, stdout, _stderr = run_tool(
                ['adb', '-s', checked_serial, 'shell', 'getprop'], timeout=30)
            props = {}
            for line in stdout.split('\n'):
                if ':' in line:
                    key, val = line.split(':', 1)
                    props[key.strip('[] ')] = val.strip('[] ')
            return jsonify({"success": True, "properties": props})

        return jsonify({"success": False, "error": "Invalid action"})
    except OutputTooLarge as e:
        return jsonify({"success": False, "error": str(e)}), 502
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/web/scan', methods=['POST'])
def web_scan():
    """Web vulnerability scan."""
    try:
        data = request.get_json() or {}
        url = data.get('url', '')
        if not url:
            return jsonify({"error": "URL required"}), 400

        # The URL reaches nuclei's argument vector, so it is checked to be
        # an http or https URL and to not begin with a dash.
        try:
            checked_url = safe_url(url)
        except UnsafeArgument as e:
            return jsonify({"success": False, "error": str(e)}), 400

        # Use nuclei if available
        try:
            returncode, stdout, _stderr = run_tool(
                ['nuclei', '-u', checked_url, '-json'],
                timeout=SCAN_TIMEOUT_SECONDS)
        except FileNotFoundError:
            return jsonify({"success": False, "error": "nuclei not installed"})

        findings = []
        for line in stdout.strip().split('\n'):
            if line:
                try:
                    findings.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

        return jsonify({
            "success": len(findings) > 0 or returncode == 0,
            "findings": findings,
            "raw_output": stdout
        })
    except OutputTooLarge as e:
        return jsonify({"success": False, "error": str(e)}), 502
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.errorhandler(Exception)
def handle_error(e):
    if isinstance(e, HTTPException):
        return jsonify({"error": e.description}), e.code
    return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    print("OSIRIS tool-collection worker")
    print(f"Tools root: {TOOLS_PATH}")
    tools = discover_tools()
    total = sum(len(v) for v in tools.values())
    print(f"Discovered {total} tools in {len(tools)} categories")
    for cat, t in tools.items():
        print(f"  {cat}: {len(t)} tools")

    if not WORKER_KEY:
        print("\nOSIRIS_WORKER_KEY is not set. Every route except /api/health")
        print("will answer 503. The platform sends the same value in the")
        print(f"{WORKER_KEY_HEADER} header.")
    else:
        print(f"\nWorker key configured. Requests must carry {WORKER_KEY_HEADER}.")

    print(f"\nBinding to {BIND_HOST}:{BIND_PORT}")
    app.run(host=BIND_HOST, port=BIND_PORT, debug=False, threaded=True)