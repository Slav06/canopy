"""Required per-call form acceptance; isolated demo fixture is restored."""
import json,urllib.request,urllib.error,http.cookiejar
from pathlib import Path
fixture=Path('.data/demo.json');before=fixture.read_bytes() if fixture.exists() else None
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));base='http://127.0.0.1:3210';passed=[]
def req(route,body=None,method=None):
 method=method or ('POST' if body is not None else 'GET');r=urllib.request.Request(base+'/api/'+route,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Origin':base,'Content-Type':'application/json'})
 try:
  with client.open(r) as response:return response.status,json.load(response)
 except urllib.error.HTTPError as e:return e.code,json.load(e)
def check(name,condition):assert condition,name;passed.append(name)
try:
 req('demo/role',{'role':'caller'});initial=req('state')[1]['state'];note=next(l for l in initial['leads'] if l['id']=='l1')['notes'];answers=next(l for l in initial['leads'] if l['id']=='l1')['answers']
 code,r=req('call-reviews/start',{'id':'review-test-1','leadId':'l1','source':'manual','ended':True});check('call form is persisted as required',code==200 and r['phase']=='required')
 check('incomplete form blocks Next',req('call-reviews/ready',{})[0]==409)
 check('another call cannot replace pending form',req('call-reviews/start',{'id':'review-other','leadId':'l3','ended':True})[0]==409)
 check('incomplete submission rejected by server',req('call-reviews/review-test-1/submit',{'leadId':'l1','answers':{'outcome':'Seller conversation'}})[0]==400)
 draft={'outcome':'Seller conversation','sellerName':'Daniel Brooks','sellerPhone':'+12025550101','sellerAddress':'1842 Willow Creek Drive, Fort Worth, TX 76107','condition':'BIG RENOVATION','conditionDetails':'Seller reports roof repair needed','motivation':'Inherited property','askingPrice':'Unknown','timeline':'ASAP','appointmentSet':'Yes','summary':'Seller discussed condition and next steps'}
 check('draft can be saved before all required fields are complete',req('call-reviews/review-test-1/draft',{'leadId':'l1','answers':draft})[0]==200)
 persisted=next(r for r in req('state')[1]['state']['callReviews'] if r['id']=='review-test-1');check('fresh state retains required form and draft',persisted['phase']=='required' and persisted['answers']['motivation']=='Inherited property')
 check('appointment date and time enforced',req('call-reviews/review-test-1/submit',{'leadId':'l1','answers':draft})[0]==400)
 complete={**draft,'appointmentDate':'2026-11-20','appointmentTime':'14:30','appointmentTimezone':'America/Chicago'}
 check('complete conversation form accepted',req('call-reviews/review-test-1/submit',{'leadId':'l1','answers':complete})[0]==200)
 check('completed form unlocks next action',req('call-reviews/ready',{})[0]==200)
 check('submitted form cannot be edited',req('call-reviews/review-test-1/draft',{'answers':{'motivation':'Rewritten'}})[0]==409)
 check('submission retry is idempotent',req('call-reviews/review-test-1/submit',{'answers':complete})[0]==200)
 state=req('state')[1]['state'];check('one timeline entry per submitted call',sum(a['kind']=='Post-call form completed' for a in state['activities'] if a['leadId']=='l1')==1)
 lead=next(l for l in state['leads'] if l['id']=='l1');check('report does not overwrite existing qualification or notes',lead['notes']==note and lead['answers']==answers)
 req('call-reviews/start',{'id':'review-test-2','leadId':'l3','ended':True});check('each new call requires its own form',req('call-reviews/ready',{})[0]==409)
 check('no-answer short form accepted',req('call-reviews/review-test-2/submit',{'leadId':'l3','answers':{'outcome':'No answer','summary':'Rang without answer'}})[0]==200)
 req('call-reviews/start',{'id':'unassociated-review','ended':True,'source':'browser_event'});check('unassociated call must explicitly choose a lead',req('call-reviews/unassociated-review/submit',{'answers':{'outcome':'No answer','summary':'No answer'}})[0]==400)
 check('cannot attach report to unassigned lead',req('call-reviews/unassociated-review/submit',{'leadId':'l2','answers':{'outcome':'No answer','summary':'No answer'}})[0]==403)
 req('call-reviews/unassociated-review/submit',{'leadId':'l1','answers':{'outcome':'No answer','summary':'No answer'}})
 req('demo/role',{'role':'owner'});check('admin can read submitted agent reports',len(req('state')[1]['state']['callReviews'])==3)
 req('demo/role',{'role':'manager'});check('other agent cannot access private call drafts',not req('state')[1]['state']['callReviews'])
 check('another agent cannot submit a caller report',req('call-reviews/review-test-1/submit',{'answers':complete})[0]==403)
 print(json.dumps({'passed':len(passed),'checks':passed},indent=2))
finally:
 if before is not None:fixture.write_bytes(before)
 elif fixture.exists():fixture.unlink()
