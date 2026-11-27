import sys; sys.path.insert(0,'tools')
import numpy as np, view, rast
from PIL import Image
js,binb,P,UV,I,img=view.mesh(sys.argv[1]); N=view.vnormals(P,I); tex=np.asarray(img(0).convert('RGB'))
vs=['side_r',rast.persp(35,18),'front','rear',rast.persp(150,22),'side_l']
ims=[rast.shade_uv(P,I,N,UV,tex,v,W=900,ss=1) for v in vs]
cv=Image.new('RGB',(1800,sum(max(ims[i].height,ims[i+1].height) for i in (0,2,4))),(40,40,40)); y=0
for i in (0,2,4):
    cv.paste(ims[i],(0,y)); cv.paste(ims[i+1],(900,y)); y+=max(ims[i].height,ims[i+1].height)
cv.save(sys.argv[2],quality=88); print(cv.size)
