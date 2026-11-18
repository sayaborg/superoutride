import sys, time, hashlib
from playwright.sync_api import sync_playwright
html,glb,out=sys.argv[1:4]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'])
    pg=b.new_page(viewport={'width':1300,'height':800}); errs=[]; pg.on('console',lambda m: errs.append(m.text) if m.type in('error','warning') else None); pg.on('pageerror',lambda e: errs.append('PAGEERROR '+str(e)))
    pg.goto('file://'+html); pg.set_input_files('#file',glb); t=time.time()
    pg.wait_for_function('window.__ready===true',timeout=240000); print('loaded in',round(time.time()-t,1),'s;',pg.inner_text('#st'))
    pg.wait_for_timeout(3000); pg.screenshot(path=out+'/painter_1.png')
    # brush: yellow stroke across the seat cowl / rider with symmetry on
    pg.evaluate("__t.setColor([246,187,3])"); pg.mouse.move(430,300); pg.mouse.down()
    for x in range(430,900,12): pg.mouse.move(x,300+(x-430)*0.2)
    pg.mouse.up(); pg.wait_for_timeout(2500); pg.screenshot(path=out+'/painter_2.png'); print('after brush:',pg.evaluate("document.getElementById('undo').disabled"))
    # fill: click the helmet red with blue
    pg.evaluate("__t.setTool('fill');__t.setColor([32,46,131])"); hit=pg.evaluate("(()=>{__t.renderPick();for(let y=120;y<260;y+=4)for(let x=500;x<800;x+=4){const t=__t.texelAt(__t.pick,x*2,y*2);if(t>=0&&__t.tex8[t*4]>200&&__t.tex8[t*4+1]<40)return [x,y]}return null})()"); print('red at',hit); pg.mouse.click(hit[0],hit[1]+44); pg.wait_for_timeout(2500); print(pg.inner_text('#st')); pg.screenshot(path=out+'/painter_3.png')
    # rotate to the other side to check symmetry, then undo both
    pg.evaluate("__t.cam.yaw=-0.7"); pg.mouse.move(300,600); pg.keyboard.down('Shift'); pg.mouse.down(); pg.mouse.move(301,600); pg.mouse.up(); pg.keyboard.up('Shift'); pg.wait_for_timeout(2500); pg.screenshot(path=out+'/painter_4.png')
    # save
    with pg.expect_download(timeout=240000) as d: pg.click('#save')
    path=out+'/painter_saved.glb'; d.value.save_as(path); print(pg.inner_text('#st')); print('saved sha',hashlib.sha256(open(path,'rb').read()).hexdigest()[:16])
    pg.keyboard.press('Control+z'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(2500); pg.screenshot(path=out+'/painter_5.png'); print('undo left:',pg.evaluate("document.getElementById('undo').disabled"))
    print('console:',errs[:8]); b.close()
