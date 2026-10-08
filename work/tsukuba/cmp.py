import numpy as np, subprocess, sys, json, os
from PIL import Image, ImageDraw
VID=os.environ.get('VID','v2')
VF={'v3':'crop=1920:760:0:0,scale=427:-1,pad=427:240:0:36','v2':'scale=427:240','v1':'scale=427:240'}[VID]
S=os.path.dirname(os.path.abspath(__file__)); REPO='/home/claude/superoutride'
ts=np.load(S+'/'+VID+'_ts.npy'); cuts=[0.0,785.63,1608.21,2044.96]; SID=['sector-1','sector-2','sector-3']
def pair(s,tag):
    t=float(np.interp(s,ts[:,1],ts[:,0])); vf=f'{S}/cmp/v_{tag}.png'; gf=f'{S}/cmp/g_{tag}.png'
    subprocess.run(['ffmpeg','-v','error','-y','-ss',f'{t:.3f}','-i',S+'/in/'+VID+'.mp4','-frames:v','1','-vf',VF,vf],check=True)
    k=max(i for i in range(3) if cuts[i]<=s)
    r=subprocess.run(['npm','run','-s','course','--','render','content/courses/tsukuba.course.json','--section',SID[k],'--s',f'{s-cuts[k]:.2f}','--l','0','--vehicle','GOLF_GTI_16V','--out',gf],cwd=REPO,capture_output=True,text=True)
    if not os.path.exists(gf): print(r.stdout[:300])
    return t,vf,gf
def sheet(stations,out,cols=3):
    cells=[]
    for i,s in enumerate(stations):
        t,vf,gf=pair(s,f'{int(s):04d}')
        c=Image.new('RGB',(427+320+6,240),'black'); c.paste(Image.open(vf).convert('RGB'),(0,0)); c.paste(Image.open(gf).convert('RGB'),(433,0))
        ImageDraw.Draw(c).text((6,222),f's={s:.0f} m  t={t:.1f} s',fill='yellow'); cells.append(c)
    rows=(len(cells)+cols-1)//cols; sh=Image.new('RGB',(cols*759,rows*246),'gray')
    for i,c in enumerate(cells): sh.paste(c,((i%cols)*759,(i//cols)*246))
    sh.save(out)
if __name__=='__main__':
    st=[float(x) for x in sys.argv[2:]]; sheet(st,sys.argv[1],cols=2)
