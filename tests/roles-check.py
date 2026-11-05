"""Role matrix against the isolated demo API; restores the original fixture."""
import json,urllib.request,urllib.error,http.cookiejar
from pathlib import Path
fixture=Path('.data/demo.json');original=fixture.read_bytes() if fixture.exists() else None
base='http://127.0.0.1:3210';jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));passed=[]
def req(route,method='GET',body=None):
 r=urllib.request.Request(base+'/api/'+route,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Origin':base,'Content-Type':'application/json'})
 try:
  with client.open(r) as response:return response.status,json.load(response)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def role(value):assert req('demo/role','POST',{'role':value})[0]==200
def check(name,condition):assert condition,name;passed.append(name)
def state():return req('state')[1]['state']
try:
 role('owner');initial=state();notes=next(l for l in initial['leads'] if l['id']=='l1')['notes'];status=next(l for l in initial['leads'] if l['id']=='l1')['status']
 role('caller')
 check('basic agent cannot overwrite notes',req('leads/l1','PATCH',{'notes':'overwrite'})[0]==403)
 check('basic agent can append a note',req('leads/l1/notes','POST',{'text':'Role-test added information'})[0]==200)
 check('append preserves original notes',next(l for l in state()['leads'] if l['id']=='l1')['notes']==notes+'\n\nRole-test added information')
 check('basic agent cannot overwrite captured qualification',req('leads/l1','PATCH',{'answers':{'ownership':'Changed'}})[0]==403)
 check('basic agent can fill unanswered qualification',req('leads/l1','PATCH',{'answers':{'roleTest':'New answer'}})[0]==200)
 check('partial answers preserve existing answers',next(l for l in state()['leads'] if l['id']=='l1')['answers']['ownership']=='Sole decision-maker')
 check('basic agent cannot edit newly saved answer',req('leads/l1','PATCH',{'answers':{'roleTest':'Changed answer'}})[0]==403)
 check('basic agent cannot change status',req('leads/l1','PATCH',{'status':'Dead'})[0]==403)
 check('basic agent cannot delete a lead',req('leads/l1','DELETE',{})[0]==403)
 check('basic agent cannot edit contacts',req('contacts/c1','PATCH',{'name':'Changed'})[0]==403)
 check('basic agent cannot edit properties',req('properties/h1','PATCH',{'address':'Changed'})[0]==403)
 check('basic agent can add call outcome',req('leads/l1/outcome','POST',{'outcome':'Interested'})[0]==200)
 check('basic outcome does not overwrite status',next(l for l in state()['leads'] if l['id']=='l1')['status']==status)
 check('basic agent cannot complete existing task',req('leads/l1/complete-action','POST',{})[0]==403)
 check('basic agent cannot escalate own role',req('team/users/caller','PATCH',{'role':'manager'})[0]==403)
 role('manager')
 check('management starts without editing access',req('leads/l1','PATCH',{'status':'Dead'})[0]==403)
 check('management without export toggle denied',req('export')[0]==403)
 role('owner');check('admin can enable manager capabilities',req('team/users/manager','PATCH',{'capabilities':{'viewAllLeads':True,'editLeads':True,'exportData':True,'manageDeals':True}})[0]==200)
 role('manager');check('view-all toggle exposes team leads',len(state()['leads'])==len(initial['leads']))
 check('edit toggle permits management edit',req('leads/l1','PATCH',{'motivation':'Management update'})[0]==200)
 check('export toggle permits export',req('export')[0]==200)
 check('deals toggle permits financial read',len(state()['deals'])>0)
 check('enabled management still cannot delete',req('leads/l1','DELETE',{})[0]==403)
 check('enabled management still cannot grant permissions',req('team/users/manager','PATCH',{'capabilities':{'importLeads':True}})[0]==403)
 role('owner');check('there is no grantable delete permission',req('team/users/manager','PATCH',{'capabilities':{'deleteLeads':True}})[0]==400)
 req('team/users/manager','PATCH',{'capabilities':{'editLeads':False,'exportData':False,'manageDeals':False}})
 role('manager');check('revoked edit toggle takes effect immediately',req('leads/l1','PATCH',{'motivation':'Denied'})[0]==403)
 check('revoked export toggle takes effect immediately',req('export')[0]==403)
 check('revoked financial toggle removes data',not state()['deals'])
 role('owner');created=req('leads','POST',{'name':'Disposable Role Fixture','phone':'+12025550198','address':'Role Test Fixture 776','city':'Dallas','state':'TX','zip':'75208','timezone':'America/Chicago'})[1];id=created['id']
 check('admin alone can delete',req('leads/'+id,'DELETE',{})[0]==200)
 check('deleted lead removed from active records',not any(l['id']==id for l in state()['leads']))
 check('deleted lead remains recoverable',any(l['id']==id for l in state()['archivedLeads']))
 role('manager');check('management cannot restore deleted leads',req('leads/'+id+'/restore','POST',{})[0]==403)
 role('owner');check('admin can restore deleted lead',req('leads/'+id+'/restore','POST',{})[0]==200 and any(l['id']==id for l in state()['leads']))
 print(json.dumps({'passed':len(passed),'checks':passed},indent=2))
finally:
 if original is not None:fixture.write_bytes(original)
 elif fixture.exists():fixture.unlink()
