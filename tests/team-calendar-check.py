"""Team booking permissions, conflict handling and privacy; restores demo fixture."""
import json,urllib.request,urllib.error,http.cookiejar
from pathlib import Path
p=Path('.data/demo.json');before=p.read_bytes();base='http://127.0.0.1:3210';c=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()));passed=[]
def req(route,method='GET',body=None):
 r=urllib.request.Request(base+'/api/'+route,method=method,data=json.dumps(body).encode() if body is not None else None,headers={'Origin':base,'Content-Type':'application/json'})
 try:
  with c.open(r) as x:return x.status,json.load(x)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def check(name,ok):assert ok,name;passed.append(name)
try:
 req('demo/role','POST',{'role':'caller'});state=req('state')[1]['state'];lead=next(l for l in state['leads'] if l['id']=='l1')
 ap={'id':'team-calendar-fixture','leadId':'l1','assignedTo':'owner','title':'Team calendar test','start':'2026-12-15T15:00:00Z','end':'2026-12-15T16:00:00Z','timezone':'America/Chicago'}
 check('basic agent books another agent calendar',req('appointments','POST',ap)[0]==200)
 check('booking retry remains idempotent',req('appointments','POST',ap)[0]==200)
 after=req('state')[1]['state'];saved=next(l for l in after['leads'] if l['id']=='l1')
 check('booking preserves lead ownership and existing status',saved['assignedTo']==lead['assignedTo'] and saved['status']==lead['status'] and saved['nextAction']==lead['nextAction'])
 check('basic agent cannot reschedule existing booking',req('appointments/'+ap['id'],'PATCH',{'start':'2026-12-15T17:00:00Z','end':'2026-12-15T18:00:00Z'})[0]==403)
 check('basic agent cannot cancel booking',req('appointments/'+ap['id'],'PATCH',{'status':'canceled'})[0]==403)
 overlap={**ap,'id':'overlap','start':'2026-12-15T15:30:00Z','end':'2026-12-15T16:30:00Z'}
 check('overlapping appointment rejected',req('appointments','POST',overlap)[0]==409)
 check('adjacent appointment accepted',req('appointments','POST',{**ap,'id':'adjacent','start':ap['end'],'end':'2026-12-15T17:00:00Z'})[0]==200)
 check('unassigned lead cannot be booked',req('appointments','POST',{**ap,'id':'unassigned','leadId':'l2'})[0]==403)
 code,busy=req('calendar/team-availability','POST',{'assignedTo':'owner','start':'2026-12-15T00:00:00Z','end':'2026-12-16T00:00:00Z'})
 check('availability returns times only',code==200 and len(busy['busy'])==2 and all(set(x)=={'start','end'} for x in busy['busy']))
 check('availability range bounded',req('calendar/team-availability','POST',{'assignedTo':'owner','start':'2026-01-01','end':'2027-01-01'})[0]==400)
 req('demo/role','POST',{'role':'owner'});req('settings','POST',{'callStart':9,'callEnd':20,'bookingAllowed':False})
 req('demo/role','POST',{'role':'caller'})
 check('admin booking switch disables basic booking',req('appointments','POST',{**ap,'id':'disabled-booking'})[0]==403)
 check('admin booking switch disables team busy lookup',req('calendar/team-availability','POST',{'assignedTo':'owner','start':'2026-12-15','end':'2026-12-16'})[0]==403)
 print(json.dumps({'passed':len(passed),'checks':passed},indent=2))
finally:p.write_bytes(before)
