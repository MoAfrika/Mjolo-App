#!/usr/bin/env python3
"""Read-only discovery of existing deployment projects. Never creates or mutates a project."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def safe_origin(value):
    parsed = urllib.parse.urlparse(value or '')
    return f'{parsed.scheme}://{parsed.hostname}' if parsed.scheme == 'https' and parsed.hostname else None


def api(provider, path, token):
    host = {'netlify': 'api.netlify.com', 'supabase': 'api.supabase.com'}[provider]
    request = urllib.request.Request(f'https://{host}{path}', headers={
        'Authorization': 'Bearer ' + token, 'Accept': 'application/json',
    })
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.load(response), None
    except urllib.error.HTTPError as error:
        return None, f'HTTP {error.code}; response body withheld'
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None, 'Network/TLS/API response unavailable; no credentials or response bodies logged'


def inspect(environ):
    result = {'mode': 'read-only', 'netlify': {}, 'supabase': {}, 'verified_targets': False}
    site_id = environ.get('NETLIFY_SITE_ID', '').strip()
    project_ref = environ.get('SUPABASE_PROJECT_REF', '').strip()
    for provider, variable in [('netlify', 'NETLIFY_AUTH_TOKEN'), ('supabase', 'SUPABASE_ACCESS_TOKEN')]:
        token = environ.get(variable)
        if not token:
            result[provider] = {'access': 'blocked', 'missing_secure_variable': variable}
            continue
        if provider == 'netlify':
            path = '/api/v1/sites' + ('/' + urllib.parse.quote(site_id, safe='') if site_id else '')
        else:
            path = '/v1/projects' + ('/' + urllib.parse.quote(project_ref, safe='') if project_ref else '')
        data, error = api(provider, path, token)
        if error:
            result[provider] = {'access': 'unconfirmed', 'reason': error}
            continue
        rows = data if isinstance(data, list) else [data]
        if not all(isinstance(row, dict) for row in rows):
            result[provider] = {'access': 'unconfirmed', 'reason': 'Unexpected response shape; body withheld'}
            continue
        if provider == 'netlify':
            projects = [{'id': row.get('id'), 'name': row.get('name'),
                         'url': safe_origin(row.get('ssl_url') or row.get('url'))} for row in rows]
        else:
            projects = [{'id': row.get('id'), 'name': row.get('name'),
                         'status': row.get('status'), 'region': row.get('region')} for row in rows]
        result[provider] = {'access': 'confirmed', 'projects': projects}
    if site_id and project_ref:
        result['verified_targets'] = (
            result['netlify'].get('access') == 'confirmed'
            and result['supabase'].get('access') == 'confirmed'
            and any(p['id'] == site_id for p in result['netlify'].get('projects', []))
            and any(p['id'] == project_ref for p in result['supabase'].get('projects', []))
        )
    if not site_id or not project_ref:
        result['next_action'] = 'Select the existing staging NETLIFY_SITE_ID and SUPABASE_PROJECT_REF; no project will be chosen or created automatically.'
    return result


if __name__ == '__main__':
    report = inspect(os.environ)
    Path('var').mkdir(exist_ok=True, mode=0o700)
    Path('var/staging-access.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    sys.exit(0 if report['verified_targets'] else 2)
