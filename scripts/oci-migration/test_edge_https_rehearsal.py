import ast
import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name('edge-https-rehearsal.py')
SPEC = importlib.util.spec_from_file_location('edge_https_rehearsal', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def embedded_functions():
    source = MODULE.GUEST.split("<<'PY'\n", 1)[1].split('\nPY\n', 1)[0]
    tree = ast.parse(source)
    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
    namespace = {}
    exec(compile(ast.Module(body=functions, type_ignores=[]), '<guard-functions>', 'exec'), namespace)
    return source, namespace


class EdgeHttpsRouteGuardTests(unittest.TestCase):
    def test_guest_script_stays_within_oci_text_limit(self):
        script = MODULE.GUEST.replace('__HOST__', MODULE.HOST).replace('__PRIVATE__', MODULE.PRIVATE)
        self.assertLessEqual(len(script.encode()), 4096)

    def test_keeps_global_auto_https_off(self):
        source, _ = embedded_functions()
        self.assertIn("auto_https[ \\t]+off", source)
        self.assertNotIn('auto_https disable_redirects', MODULE.GUEST)

    def test_restarts_systemd_when_caddy_admin_api_is_disabled(self):
        self.assertNotIn('caddy reload', MODULE.GUEST)
        self.assertGreaterEqual(MODULE.GUEST.count('systemctl restart caddy'), 2)
        self.assertIn("systemctl is-active --quiet caddy", MODULE.GUEST)
        self.assertIn("ss -H -ltn 'sport = :8080' | grep -q .", MODULE.GUEST)

    def test_caddy_group_renumbering_is_semantically_equal(self):
        _, functions = embedded_functions()
        canonical = functions['canonical']
        before = {'routes': [{'group': 'group2', 'handle': [
            {'routes': [{'group': 'group1'}, {'group': 'group0'}]},
            {'group': 'group2'},
        ]}]}
        after = {'routes': [{'group': 'group6', 'handle': [
            {'routes': [{'group': 'group1'}, {'group': 'group0'}]},
            {'group': 'group6'},
        ]}]}
        self.assertEqual(canonical(before), canonical(after))

    def test_group_relationship_and_route_changes_still_fail(self):
        _, functions = embedded_functions()
        canonical = functions['canonical']
        before = {'routes': [{'group': 'outer'}, {'group': 'outer'}]}
        regrouped = {'routes': [{'group': 'one'}, {'group': 'two'}]}
        rerouted = {'routes': [{'handle': [{'upstreams': [{'dial': '10.20.10.176:9999'}]}]}]}
        self.assertNotEqual(canonical(before), canonical(regrouped))
        self.assertNotEqual(canonical(before), canonical(rerouted))


if __name__ == '__main__':
    unittest.main()
