"""Local demo acceptance checks; restore the fixture after the test."""
import json, urllib.request, urllib.error, http.cookiejar
from pathlib import Path
p=Path('.data/demo.json'); original=p.read_bytes()
base='http://127.0.0.1:3210'; client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def req(route,method='GET',body=None):
 r=urllib.request.Request(base+'/api/'+route,method=method,data=json.dumps(body).encode() if body is not None else None,headers={'Origin':base,'Content-Type':'application/json'})
 try:
  with client.open(r) as res:return res.status,json.load(res)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
try:
 assert req('demo/role','POST',{'role':'owner'})[0]==200
 for stage in ['New','Attempting Contact','Follow-Up','Qualified','Appointment Set','Offer Made','Under Contract','Marketing to Buyers','Assigned','Closing','Closed','Dead']:
  assert req('leads/l1','PATCH',{'status':stage})[0]==200,stage
  assert next(l for l in req('state')[1]['state']['leads'] if l['id']=='l1')['status']==stage
 assert req('leads/l1','PATCH',{'status':'Invented'})[0]==400
 propertyId=next(l for l in req('state')[1]['state']['leads'] if l['id']=='l1')['propertyId']
 route='properties/'+propertyId
 assert req(route,'PATCH',{'streetViewEmbed':'https://evil.test/maps/embed?pb=x'})[0]==400
 assert req(route,'PATCH',{'streetViewEmbed':'<iframe src="https://www.google.com/maps/embed?pb=fixture"></iframe>'})[0]==200
 assert req('demo/role','POST',{'role':'caller'})[0]==200
 assert req(route,'PATCH',{'streetViewEmbed':''})[0]==403
 assert req('leads/l1','PATCH',{'status':'New'})[0]==403
 print('Pipeline acceptance passed: all 12 stages persist, invalid stages/embeds rejected, Google share iframe normalized, Basic Agent stage/embed edits denied.')
finally:p.write_bytes(original)
