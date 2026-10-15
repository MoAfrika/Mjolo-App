#!/usr/bin/env python3
"""Private terminal prompt; the administrator password exists only in this process and its child."""
import getpass
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse


def provision(environ, prompt=getpass.getpass, run=subprocess.run):
    if environ.get('MJOLO_ADMIN_INITIAL_PASSWORD'):
        raise ValueError('Unset any persistent MJOLO_ADMIN_INITIAL_PASSWORD before using this private-prompt helper.')
    if not environ.get('SUPABASE_URL') or not environ.get('SUPABASE_SERVICE_ROLE_KEY'):
        raise ValueError('Securely inject SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY into this trusted server process first.')
    ref = environ.get('SUPABASE_PROJECT_REF', '')
    url = urlparse(environ['SUPABASE_URL'])
    if not ref or url.scheme != 'https' or url.hostname != ref + '.supabase.co' or url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
        raise ValueError('Set SUPABASE_PROJECT_REF to the confirmed staging project and use its exact HTTPS URL.')
    password = prompt('Initial administrator password (hidden; never logged): ')
    if not 12 <= len(password) <= 128:
        raise ValueError('Initial password must contain 12–128 characters.')
    if password != prompt('Confirm initial administrator password (hidden): '):
        raise ValueError('Passwords do not match. Nothing was provisioned.')
    child_env = dict(environ)
    child_env['MJOLO_ADMIN_INITIAL_PASSWORD'] = password
    try:
        result = run(['node', str(Path(__file__).resolve().with_name('provision-admin.mjs'))], env=child_env, check=False)
        return result.returncode
    finally:
        child_env.pop('MJOLO_ADMIN_INITIAL_PASSWORD', None)
        password = None


if __name__ == '__main__':
    try:
        sys.exit(provision(os.environ))
    except (ValueError, EOFError, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, ValueError) else 'Provisioning cancelled; no password logged.', file=sys.stderr)
        sys.exit(2)
