"""Unit checks for deployment safety guards, not evidence of provider access."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('staging_access', ROOT / 'scripts/staging-access.py')
access = importlib.util.module_from_spec(spec)
spec.loader.exec_module(access)

class StagingToolsTest(unittest.TestCase):
    def test_missing_auth_blocks_instead_of_creating_or_selecting_projects(self):
        result = access.inspect({})
        self.assertFalse(result['verified_targets'])
        self.assertEqual(result['netlify']['missing_secure_variable'], 'NETLIFY_AUTH_TOKEN')
        self.assertEqual(result['supabase']['missing_secure_variable'], 'SUPABASE_ACCESS_TOKEN')

    def test_successful_discovery_still_requires_explicit_target_selection(self):
        def api(provider, path, token):
            return ([{'id': 'site-a' if provider == 'netlify' else 'project-a', 'name': 'QA',
                      'token': 'must-not-be-reported', 'ssl_url': 'https://user:private@staging.example/?key=private'}], None)
        with patch.object(access, 'api', side_effect=api):
            result = access.inspect({'NETLIFY_AUTH_TOKEN': 'hidden-token', 'SUPABASE_ACCESS_TOKEN': 'hidden-token'})
        self.assertFalse(result['verified_targets'])
        encoded = json.dumps(result)
        for secret in ['hidden-token', 'must-not-be-reported', 'user:', 'key=private']:
            self.assertNotIn(secret, encoded)
        self.assertEqual(result['netlify']['projects'][0]['url'], 'https://staging.example')

    def test_verified_targets_require_both_actual_ids_to_match(self):
        def api(provider, path, token):
            return ({'id': 'site-a' if provider == 'netlify' else 'project-a', 'name': 'QA'}, None)
        env = {'NETLIFY_AUTH_TOKEN': 'hidden', 'SUPABASE_ACCESS_TOKEN': 'hidden',
               'NETLIFY_SITE_ID': 'site-a', 'SUPABASE_PROJECT_REF': 'project-a'}
        with patch.object(access, 'api', side_effect=api):
            self.assertTrue(access.inspect(env)['verified_targets'])
            self.assertFalse(access.inspect({**env, 'NETLIFY_SITE_ID': 'another-site'})['verified_targets'])

    def test_partial_access_does_not_authorise_a_build_target(self):
        def api(provider, path, token):
            return ({'id':'site-a'}, None) if provider == 'netlify' else (None, 'HTTP 401; response body withheld')
        with patch.object(access, 'api', side_effect=api):
            result = access.inspect({'NETLIFY_AUTH_TOKEN':'hidden','SUPABASE_ACCESS_TOKEN':'hidden',
                                     'NETLIFY_SITE_ID':'site-a','SUPABASE_PROJECT_REF':'project-a'})
        self.assertFalse(result['verified_targets'])

    def test_staging_build_fails_closed_and_does_not_log_admin_password(self):
        env = {k:v for k,v in os.environ.items() if k not in
               ['NETLIFY_SITE_ID','SUPABASE_PROJECT_REF','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY']}
        env['MJOLO_ADMIN_INITIAL_PASSWORD'] = 'unit-test-value-never-for-an-account'
        with tempfile.TemporaryDirectory() as work:
            result = subprocess.run(['node', str(ROOT / 'scripts/staging-build.mjs')], cwd=work,
                                    env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn(env['MJOLO_ADMIN_INITIAL_PASSWORD'], result.stdout + result.stderr)
            self.assertFalse((Path(work) / 'dist').exists())

    def test_origin_sanitisation_rejects_untrusted_schemes(self):
        self.assertIsNone(access.safe_origin('http://insecure.example'))
        self.assertIsNone(access.safe_origin('javascript:alert(1)'))
        self.assertEqual(access.safe_origin('https://example.netlify.app/path?q=value'), 'https://example.netlify.app')

class SecureProvisionerTest(unittest.TestCase):
    def setUp(self):
        spec=importlib.util.spec_from_file_location('secure_provisioner',ROOT/'scripts/provision-admin-secure.py')
        self.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.module)
        self.env={'SUPABASE_URL':'https://staging-ref.supabase.co','SUPABASE_PROJECT_REF':'staging-ref','SUPABASE_SERVICE_ROLE_KEY':'unit-test-server-key'}

    def test_password_only_reaches_child_environment_and_is_cleared_afterwards(self):
        password='unit-test-password-not-for-an-account'
        seen=[]
        def run(args,env,check):
            self.assertEqual(env['MJOLO_ADMIN_INITIAL_PASSWORD'],password)
            self.assertNotIn(password,' '.join(args))
            seen.append(env)
            class Result:returncode=0
            return Result()
        self.assertEqual(self.module.provision(self.env,prompt=lambda _:password,run=run),0)
        self.assertNotIn('MJOLO_ADMIN_INITIAL_PASSWORD',self.env)
        self.assertNotIn('MJOLO_ADMIN_INITIAL_PASSWORD',seen[0])

    def test_persistent_admin_password_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'Unset any persistent'):
            self.module.provision({**self.env,'MJOLO_ADMIN_INITIAL_PASSWORD':'unit-test-only'})

    def test_wrong_project_is_rejected_before_any_prompt_or_process(self):
        def no_prompt(_):self.fail('No prompt should occur for a mismatched project')
        with self.assertRaisesRegex(ValueError,'confirmed staging project'):
            self.module.provision({**self.env,'SUPABASE_URL':'https://other-ref.supabase.co'},prompt=no_prompt)

if __name__ == '__main__':
    unittest.main()
