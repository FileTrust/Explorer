#!/usr/bin/env python3
"""Hourly compatible network settings; preserve indexed deployment history."""
import argparse,json,os,subprocess,time,urllib.request
from pathlib import Path
import configure as C
from ft_network_config import atomic,canonical,digest,fetch,https,locked,rpc
HERE=Path(__file__).resolve().parent
UNITS=['filetrust-explorer-indexer','filetrust-explorer']

def assess(payload,saved,deployed):
    remote=payload['deployed_addresses'];network=payload['network']
    if int(remote['chainId'])!=int(deployed['chainId']): raise ValueError('Network mismatch; operator migration required')
    if canonical(remote.get('contracts',{}))!=canonical(deployed.get('contracts',{})):
        raise ValueError('Contract deployment changed; coordinated history/index migration required')
    root=Path(saved.get('EXPLORER_BLOCKCHAIN_ROOT',''))
    local={}
    for path in (root/'artifacts/contracts').rglob('*.json'):
        try: artifact=json.loads(path.read_text())
        except (ValueError,OSError): continue
        if isinstance(artifact,dict) and isinstance(artifact.get('abi'),list):
            local.setdefault(artifact.get('contractName') or path.stem,set()).add(digest(artifact['abi']))
    # Runtime projection code has not changed. Only an exactly known ABI can
    # be considered decoder-compatible without a separate application review.
    for name,artifact in payload.get('artifact_files',{}).items():
        if not isinstance(artifact,dict) or not isinstance(artifact.get('abi'),list): raise ValueError('Invalid ABI package')
        contract=artifact.get('contractName') or Path(name).stem
        if digest(artifact['abi']) not in local.get(contract,set()):
            raise ValueError('ABI compatibility requires operator review: '+contract)
    expected=int(remote['chainId'])
    public=https(network['rpc_url'])
    if int(rpc(public,'eth_chainId',[]),16)!=expected: raise ValueError('RPC chain mismatch')
    # Validate contracts against the proposed RPC before any activation.
    for value in remote.get('contracts',{}).values():
        if isinstance(value,str) and value.startswith('0x') and len(value)==42 and int(value[2:],16):
            if rpc(public,'eth_getCode',[value,'latest']) in ('0x','0x0',''): raise ValueError('Missing deployed contract code')
    selected=saved.get('EXPLORER_RPC_OVERRIDE') or public
    if int(rpc(selected,'eth_chainId',[]),16)!=expected: raise ValueError('Selected RPC chain mismatch')
    values={'RPC_URL':selected}
    price=saved.get('EXPLORER_PRICE_OVERRIDE') or network.get('ftu_price_url')
    if price: values['FTU_PRICE_URL']=https(price)
    return {key:value for key,value in values.items() if saved.get(key)!=value}

def merge_environment(original,changes):
    lines=original.splitlines()
    for key,value in changes.items():
        lines=[line for line in lines if line.split('=',1)[0].strip()!=key];lines.append(key+'='+value)
    return '\n'.join(lines)+'\n'

def write_environment(path,text):
    import tempfile
    path=Path(path);info=path.stat();fd,name=tempfile.mkstemp(prefix='.network-env-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as out:out.write(text);out.flush();os.fsync(out.fileno())
        os.chmod(name,info.st_mode&0o777)
        if os.geteuid()==0:os.chown(name,info.st_uid,info.st_gid)
        os.replace(name,path)
    finally:Path(name).unlink(missing_ok=True)

def restore(previous):
    write_environment(C.ENV_LOCAL,previous['environment'])
    if previous.get('web_environment') is not None:write_environment(HERE/'.env.web',previous['web_environment'])


def services(action): subprocess.run(['systemctl',action,*UNITS],check=True,timeout=300)
def healthy(saved):
    port=int(saved.get('PORT','3001'))
    for _ in range(40):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=5) as response:
                if response.status==200:
                    for unit in UNITS:subprocess.run(['systemctl','is-active','--quiet',unit],check=True)
                    return
        except Exception:time.sleep(1)
    raise ValueError('Explorer health check failed')

def refresh(check_only=False):
    state=HERE/'.network-updates';state.mkdir(exist_ok=True,mode=0o700)
    with locked(state/'refresh.lock'):
        journal=state/'activation.json'
        if journal.exists() and check_only:
            return {'state':'recovery_required','reason':'An interrupted activation needs recovery by the normal refresh command.'}
        if journal.exists():
            # A prior interruption must restore the old shared environment
            # before either consumer is started. No index data is modified.
            previous=json.loads(journal.read_text());services('stop');restore(previous);services('start');healthy(C.saved_env());journal.unlink()
        saved=C.saved_env();payload=fetch(saved.get('NETWORK_CONFIG_URL') or C.DEFAULT_CONFIG_URL)
        deployed=json.loads(C.DEPLOYED_JSON.read_text());fingerprint=digest({'deployment':payload['deployed_addresses'].get('contracts'),'chain':payload['deployed_addresses'].get('chainId'),'network':payload['network'],'abis':{name:value.get('abi') for name,value in payload.get('artifact_files',{}).items()}})
        try: changes=assess(payload,saved,deployed)
        except ValueError as exc:
            result={'state':'blocked','content_sha256':fingerprint,'reason':str(exc),'checked_at':time.time()}
            old=json.loads((state/'status.json').read_text()) if (state/'status.json').exists() else {}
            atomic(state/'status.json',result)
            if (old.get('state'),old.get('content_sha256'))!=('blocked',fingerprint):print('Explorer network settings notice: '+str(exc),flush=True)
            return result
        if check_only or not changes:
            result={'state':'available' if changes else 'current','changes':list(changes),'content_sha256':fingerprint,'checked_at':time.time()};atomic(state/'status.json',result);return result
        # Both processes use the same endpoint values (.env.local and the web
        # reader environment). Stop both, atomically
        # change that one file, then start together. Retain rollback journal.
        original=C.ENV_LOCAL.read_text();web=HERE/'.env.web';previous={'environment':original,'web_environment':web.read_text() if web.is_file() else None};atomic(journal,previous)
        try:
            services('stop')
            write_environment(C.ENV_LOCAL,merge_environment(original,changes))
            if previous['web_environment'] is not None:write_environment(web,merge_environment(previous['web_environment'],changes))
            services('start');healthy(C.saved_env())
        except BaseException:
            services('stop');restore(previous);services('start');raise
        atomic(state/'history'/(str(int(time.time()))+'-'+fingerprint+'.json'),previous)
        journal.unlink();result={'state':'applied','changes':list(changes),'content_sha256':fingerprint,'checked_at':time.time()};atomic(state/'status.json',result);print('Explorer compatible network settings applied: '+', '.join(changes),flush=True);return result

def install_timer():
    import sys
    if os.geteuid()!=0:raise ValueError('Timer installation requires root')
    if any(c in str(HERE)+sys.executable for c in '\n\r%"'):raise ValueError('Unsupported application path')
    base=Path('/etc/systemd/system')
    (base/'filetrust-explorer-network-config.service').write_text(f'[Unit]\nDescription=Check compatible Explorer network settings\nAfter=network-online.target\n[Service]\nType=oneshot\nWorkingDirectory={HERE}\nExecStart={sys.executable} "{HERE}/network_config_refresh.py"\nTimeoutStartSec=600\nUMask=0077\n')
    (base/'filetrust-explorer-network-config.timer').write_text('[Unit]\nDescription=Hourly Explorer network settings check\n[Timer]\nOnBootSec=5min\nOnUnitActiveSec=1h\nRandomizedDelaySec=5min\nPersistent=true\n[Install]\nWantedBy=timers.target\n')
    subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','enable','--now','filetrust-explorer-network-config.timer'],check=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check-only',action='store_true');parser.add_argument('--install-timer',action='store_true');args=parser.parse_args()
    try:
        if args.install_timer:install_timer()
        else:print(json.dumps(refresh(args.check_only),indent=2))
    except Exception:
        print('Explorer network settings check unavailable; saved settings retained.',flush=True);raise SystemExit(1)
