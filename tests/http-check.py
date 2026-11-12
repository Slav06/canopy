"""Loopback-only demo checks. Restores the original demo fixture in finally."""
import json, urllib.request, urllib.error, http.cookiejar
from pathlib import Path
base='http://127.0.0.1:3210'
fixture=Path('.data/demo.json'); before=fixture.read_bytes() if fixture.exists() else None
jar=http.cookiejar.CookieJar(); client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)); passed=[]
def req(route,method='GET',body=None):
    data=json.dumps(body).encode() if body is not None else None
    r=urllib.request.Request(base+'/api/'+route,data=data,method=method,headers={'Content-Type':'application/json','Origin':base})
    try:
        with client.open(r) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
def check(name,condition):
    assert condition,name
    passed.append(name)
try:
    code,d=req('state'); assert code==200 and d['mode']=='demo'
    req('demo/role','POST',{'role':'caller'})
    code,d=req('state'); check('caller API omits financials and owner leads',not d['state']['deals'] and all(l['assignedTo']=='caller' for l in d['state']['leads']))
    check('caller direct export denied',req('export')[0]==403)
    check('caller direct financial write denied',req('deals/d1','PATCH',{'collectedFee':999})[0]==403)
    check('caller direct unassigned lead edit denied',req('leads/l2','PATCH',{'notes':'not allowed'})[0]==403)
    check('caller cannot reassign own lead',req('leads/l1','PATCH',{'assignedTo':'owner'})[0]==400)
    check('assigned note save accepted',req('leads/l1/notes','POST',{'text':'HTTP persistence test'})[0]==200)
    check('note survives independent GET',next(l for l in req('state')[1]['state']['leads'] if l['id']=='l1')['notes'].endswith('HTTP persistence test'))
    req('demo/role','POST',{'role':'owner'})
    check('same seller other property keeps notes',next(l for l in req('state')[1]['state']['leads'] if l['id']=='l4')['notes']!='HTTP persistence test')
    check('CRM exposes no call-start API',req('dialerr/prepare','POST',{'leadId':'l5'})[0]==410)
    ap={'id':'http-check-appointment','leadId':'l1','assignedTo':'owner','title':'Test appointment','start':'2026-11-06T15:00:00Z','end':'2026-11-06T16:00:00Z','timezone':'America/Chicago'}
    check('appointment save accepted',req('appointments','POST',ap)[0]==200)
    req('appointments','POST',ap)
    check('appointment retry idempotent',sum(a['id']==ap['id'] for a in req('state')[1]['state']['appointments'])==1)
    check('invalid appointment rejected',req('appointments/http-check-appointment','PATCH',{'start':'bad','end':'bad'})[0]==400)
    check('Dialerr API messaging disabled in toolbar-only mode',req('messages','POST',{'id':'unused','leadId':'l1','body':'Not sent'})[0]==410)
    check('server-side Dialerr token minting disabled',req('dialerr/token')[0]==410)
    check('Dialerr API reconciliation disabled',req('dialerr/reconcile','POST',{'leadId':'l1'})[0]==410)
    check('readiness explicitly reports demo not team ready',req('readiness')[1]['readyForTeam'] is False)
    check('real account creation rejected in demo',req('team/users','POST',{})[0]==409)
    newlead={'name':'Imported override must not replace name','phone':'2025550101','address':'88 Separate Property','city':'Dallas','state':'TX','zip':'75208','timezone':'America/Chicago'}
    code,created=req('leads','POST',newlead)
    check('manual entry reuses known seller for another property',code==200 and created['contactId']=='c1')
    check('manual duplicate property rejected',req('leads','POST',newlead)[0]==409)
    check('invalid manual timezone rejected',req('leads','POST',{**newlead,'address':'99 Other','timezone':'invalid'})[0]==400)
    req('appointments/http-check-appointment','PATCH',{'start':'2026-11-07T15:00:00Z','end':'2026-11-07T16:00:00Z'})
    check('reschedule updates linked next-action date',next(l for l in req('state')[1]['state']['leads'] if l['id']=='l1')['dueAt']=='2026-11-07T15:00:00Z')
    req('appointments/http-check-appointment','PATCH',{'status':'canceled'})
    check('cancel removes stale appointment next action',not next(l for l in req('state')[1]['state']['leads'] if l['id']=='l1')['nextAction'])
    check('complete next action persists',req('leads/l4/complete-action','POST',{})[0]==200 and not next(l for l in req('state')[1]['state']['leads'] if l['id']=='l4')['nextAction'])
    check('Do Not Contact flag rejects strings',req('contacts/c1','PATCH',{'dnc':'false'})[0]==400)
    # Reject a cross-origin mutation even with an authenticated demo cookie.
    r=urllib.request.Request(base+'/api/settings',data=b'{}',method='POST',headers={'Content-Type':'application/json','Origin':'https://untrusted.invalid'})
    try:client.open(r); raise AssertionError('cross origin was allowed')
    except urllib.error.HTTPError as e:check('cross-origin mutation rejected',e.code==403)
    print(json.dumps({'passed':len(passed),'checks':passed},indent=2))
finally:
    if before is not None:fixture.write_bytes(before)
    elif fixture.exists():fixture.unlink()
