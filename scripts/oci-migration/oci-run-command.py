#!/usr/bin/env python3
"""Submit once or inspect one existing OCI Run Command; never retry mutations.

Config contains only compartment/instance OCIDs resolved from teswa-platform /
teswa-core-01. Scripts and outputs must not contain credentials.
"""
import argparse
import json
import os
import subprocess
from pathlib import Path


def cli(*args):
    result = subprocess.run(['oci', *args, '--output', 'json'], text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stderr)
    return json.loads(result.stdout)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['submit', 'status'])
    p.add_argument('--target-config', required=True)
    p.add_argument('--run-dir', required=True)
    p.add_argument('--script')
    p.add_argument('--name', default='teswa-lane4-identity-anchor')
    a = p.parse_args()
    config = json.loads(Path(a.target_config).read_text())
    out = Path(a.run_dir)
    if a.action == 'submit':
        if out.exists():
            raise SystemExit('Run directory exists. Inspect its command before any resubmission.')
        if not a.script:
            raise SystemExit('--script is required')
        script = Path(a.script).read_text()
        if len(script.encode()) > 4096:
            raise SystemExit('Run Command TEXT exceeds 4096 bytes; use a hashed private artifact.')
        instance = cli('compute', 'instance', 'get', '--instance-id', config['instance'])['data']
        if (instance['display-name'] != 'teswa-core-01' or instance['compartment-id'] != config['compartment']
                or instance['lifecycle-state'] != 'RUNNING'):
            raise SystemExit('Wrong or unavailable target')
        out.mkdir(parents=True, mode=0o700)
        content = {'source': {'sourceType': 'TEXT', 'text': script}, 'output': {'outputType': 'TEXT'}}
        (out/'content.json').write_text(json.dumps(content))
        (out/'target.json').write_text(json.dumps({'instanceId': config['instance']}))
        os.chmod(out/'content.json', 0o600)
        result = cli('instance-agent', 'command', 'create', '--compartment-id', config['compartment'],
                     '--content', 'file://'+str((out/'content.json').resolve()),
                     '--target', 'file://'+str((out/'target.json').resolve()),
                     '--timeout-in-seconds', '480', '--display-name', a.name)
        (out/'command.json').write_text(json.dumps(result))
        print('command_submitted=true')
    else:
        command = json.loads((out/'command.json').read_text())['data']['id']
        result = cli('instance-agent', 'command-execution', 'get', '--command-id', command,
                     '--instance-id', config['instance'])
        (out/'execution.json').write_text(json.dumps(result, indent=2)+'\n')
        data = result['data']
        state = data['lifecycle-state']
        print('run_command_state='+state)
        if state in ('SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELED'):
            content = data.get('content') or {}
            print('exit_code='+str(content.get('exit-code')))
            print(content.get('text', ''))
            if state != 'SUCCEEDED' or content.get('exit-code') != 0:
                raise SystemExit(2)


if __name__ == '__main__':
    main()
