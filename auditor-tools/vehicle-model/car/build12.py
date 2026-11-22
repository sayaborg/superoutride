import sys,io,json,hashlib,time,numpy as np;sys.path.insert(0,'/home/claude/work928/tools');import glbio,ao
from PIL import Image
from scipy import ndimage as ndi
SRC='out/porsche-928-s4-1987-v11.glb';DST='out/porsche-928-s4-1987-v12.glb'
js,b,P,N,UV,I=ao.load(SRC)
def img(k):
    bv=js['bufferViews'][js['images'][k]['bufferView']];o=bv.get('byteOffset',0);return np.array(Image.open(io.BytesIO(bytes(b[o:o+bv['byteLength']]))).convert('RGB'))
B=img(0);M=img(1).copy();X=np.load('painted/texpos.npy');cov=~np.isnan(X[...,0])
PAINT=(231,10,14);MAG=(255,0,255);WIN=(10,10,12)
pa=(B==PAINT).all(2);mg=(B==MAG).all(2);wn=(B==WIN).all(2)
# glass = the six panes (large connected patches of the window colour on the surface); other texels of that colour are black parts
VOX=0.004;ys,xs=np.nonzero(cov&wn);Pw=X[ys,xs].astype(float);lo=Pw.min(0)-2*VOX;ijk=np.floor((Pw-lo)/VOX).astype(int);occ=np.zeros(tuple(ijk.max(0)+3),bool);occ[tuple(ijk.T)]=True
lab,n=ndi.label(occ,np.ones((3,3,3)));l=lab[tuple(ijk.T)];sz=np.bincount(l,minlength=n+1);big=sz>20000;print('panes',int(big.sum()),sz[big])
glass=np.zeros(B.shape[:2],bool);glass[ys[big[l]],xs[big[l]]]=True
d,ind=ndi.distance_transform_edt(~cov,return_indices=True);pad=(~cov)&(d<=8);glass[pad]=glass[ind[0][pad],ind[1][pad]]
gloss=pa|mg|glass;dark=(B.max(2)<72)&~gloss
M[...,1][dark]=230;M[...,1][gloss]=26
print('gloss texels',int((gloss&cov).sum()),'matt',int((dark&cov).sum()),'window colour but matt',int((wn&~glass&cov).sum()))
t=time.time();A=np.empty(len(P))
for s in range(0,len(P),200000):A[s:s+200000]=ao.ao(P,N,I,np.arange(s,min(len(P),s+200000)),192,False)
print('ao',round(time.time()-t),'s mean',A.mean().round(3));np.save('out/ao_v12.npy',A)
r=np.load('out/uvraster.npz');tb=r['tb'];wb=r['wb'].astype(np.float64);ok=tb>=0
O=np.ones(B.shape[:2]);O[ok]=np.einsum('nk,nk->n',wb[ok],A[I[tb[ok]]]);pad=(~ok)&(ndi.distance_transform_edt(~ok,return_indices=True)[0]<=8)
ind=ndi.distance_transform_edt(~ok,return_indices=True)[1];O[pad]=O[ind[0][pad],ind[1][pad]]
O8=np.clip(np.round(O*255),0,255).astype(np.uint8);OC=np.stack([O8]*3,2)
def png(a):
    bio=io.BytesIO();Image.fromarray(a).save(bio,'PNG');return bio.getvalue()
new={js['textures'][js['materials'][0]['pbrMetallicRoughness']['metallicRoughnessTexture']['index']]['source']:png(M)}
out=bytearray()
for i in sorted(range(len(js['bufferViews'])),key=lambda i:js['bufferViews'][i].get('byteOffset',0)):
    v=js['bufferViews'][i];o=v.get('byteOffset',0);data=bytes(b[o:o+v['byteLength']])
    for k,p in new.items():
        if js['images'][k]['bufferView']==i:data=p;js['images'][k]['mimeType']='image/png';js['images'][k]['name']='metallic_roughness.png'
    while len(out)%4:out.append(0)
    v['byteOffset']=len(out);v['byteLength']=len(data);out+=data
while len(out)%4:out.append(0)
p=png(OC);js['bufferViews'].append({'buffer':0,'byteOffset':len(out),'byteLength':len(p)});out+=p
js['images'].append({'name':'occlusion.png','mimeType':'image/png','bufferView':len(js['bufferViews'])-1});js['textures'].append({'source':len(js['images'])-1,'sampler':0})
js['materials'][0]['occlusionTexture']={'index':len(js['textures'])-1};js['buffers'][0]['byteLength']=len(out)+(-len(out))%4
e=js['nodes'][0]['extras'];w={}
for k in ('wheel_FL','wheel_FR','wheel_RL','wheel_RR'):w[k]={'centre':e[k]['center'],'radius':e[k]['radius'],'width':e[k]['width']}
js['nodes'][0]['extras']={'source':'K, Tripo model pink_sports_car_3d_model.glb, fitted by Claude 2026-11-19/20','vehicle':'Porsche 928 S4 1987 (United States)','units':'m','up':'+y','forward':'+z','left':'+x','origin':'ground, mid-wheelbase, centerline',
 'overall':{'length':4.5207,'width':1.836,'height':1.282,'wheelbase':2.5,'width_with_mirrors':1.9643,'front_track':1.549,'rear_track':1.546},
 'body_paint':list(PAINT),'glass':list(WIN),'brake_lamp':list(MAG),**w,'paint':{'body':list(PAINT),'window':list(WIN),'brakeLamp':list(MAG)},
 'reflectance':{'roughness':{'body_paint':0.1,'glass':0.1,'brake_lamp':0.1,'black_parts':0.9},'note':'metallicRoughness texture, G = roughness; as the Testarossa and RX-7 models'},
 'occlusion':{'note':'occlusion texture, R: the share of its surroundings a point sees, cosine-weighted, 96 directions a side; computed at the vertices'},
 'note':'K painted the brake lamps, the front intake and the rear bumper; body and glass faired; tyres and tracks set to the 1987 US car; the panel between the tail lamps made flat'}
glbio.save(DST,js,out);h=hashlib.sha256(open(DST,'rb').read()).hexdigest();print(len(open(DST,'rb').read()),h)
