import {clamp, longitude, spherePoint, globePointAt, countryAt, countryDistance, prepareCountries} from './world-geometry.mjs';

const RAD = Math.PI / 180;
const VERTEX = `
attribute vec3 aPosition; attribute vec2 aUV;
uniform vec2 uRotation; uniform float uDistance; uniform float uAspect; uniform float uRadius;
varying vec2 vUV; varying vec3 vNormal;
void main(){
  float a=uRotation.x,b=uRotation.y;
  vec3 p=aPosition*uRadius;
  p=vec3(cos(a)*p.x-sin(a)*p.z,p.y,sin(a)*p.x+cos(a)*p.z);
  p=vec3(p.x,cos(b)*p.y-sin(b)*p.z,sin(b)*p.y+cos(b)*p.z);
  vNormal=normalize(p);vUV=aUV;
  float z=p.z-uDistance;float f=2.605089;float near=.015;float far=20.0;
  gl_Position=vec4(f/uAspect*p.x,f*p.y,(far+near)/(near-far)*z+2.0*far*near/(near-far),-z);
  gl_PointSize=7.0;
}`;
const EARTH_FRAGMENT = `
precision mediump float;varying vec2 vUV;varying vec3 vNormal;uniform sampler2D uTexture;
void main(){float light=.68+.32*max(0.0,dot(normalize(vNormal),normalize(vec3(.35,.5,1.2))));gl_FragColor=vec4(texture2D(uTexture,vUV).rgb*light,1.0);}`;
const LINE_FRAGMENT = `precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}`;
const ATMOSPHERE_FRAGMENT = `precision mediump float;varying vec3 vNormal;void main(){float rim=pow(1.0-abs(normalize(vNormal).z),3.0);gl_FragColor=vec4(.2,.55,1.0,rim*.45);}`;

function program(gl, vertex, fragment) {
  const shaders = [];
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw Error('Globe graphics are unavailable.'); }
    shaders.push(shader);
  }
  const p = gl.createProgram(); for (const shader of shaders) gl.attachShader(p, shader);
  gl.linkProgram(p); for (const shader of shaders) gl.deleteShader(shader);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { gl.deleteProgram(p); throw Error('Globe graphics are unavailable.'); }
  return {handle:p, position:gl.getAttribLocation(p,'aPosition'), uv:gl.getAttribLocation(p,'aUV'),
    rotation:gl.getUniformLocation(p,'uRotation'), distance:gl.getUniformLocation(p,'uDistance'), aspect:gl.getUniformLocation(p,'uAspect'),
    radius:gl.getUniformLocation(p,'uRadius'), color:gl.getUniformLocation(p,'uColor'), texture:gl.getUniformLocation(p,'uTexture')};
}
function sphereMesh() {
  const vertices = [], indices = []; const latitudeSteps = 120, longitudeSteps = 240;
  for (let i=0;i<=latitudeSteps;i++) for(let j=0;j<=longitudeSteps;j++) {
    vertices.push(...spherePoint(-180+360*j/longitudeSteps,-90+180*i/latitudeSteps),j/longitudeSteps,i/latitudeSteps);
  }
  for(let i=0;i<latitudeSteps;i++) for(let j=0;j<longitudeSteps;j++) {
    const a=i*(longitudeSteps+1)+j,b=a+longitudeSteps+1;
    indices.push(a,a+1,b,a+1,b+1,b);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint16Array(indices)};
}
function outlineVertices(countries) {
  const points=[];
  for(const country of countries) for(const ring of country.rings) for(let i=0;i<ring.length-1;i++) {
    const a=ring[i],b=ring[i+1],delta=longitude(b[0]-a[0]);
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(delta),Math.abs(b[1]-a[1]))/2));
    for(let j=0;j<steps;j++) for(const part of [j,j+1]) {
      const t=part/steps; points.push(...spherePoint(a[0]+delta*t,a[1]+(b[1]-a[1])*t));
    }
  }
  return new Float32Array(points);
}

/** Positive zoom(delta) moves closer. Programmatic select never calls onSelect. */
export function mountGlobe(container, {countries, webcamCountries=[], onSelect=()=>{}, onHover=()=>{}, selected='', signal}={}) {
  const rows=prepareCountries(countries); const byCode=new Map(rows.map(country=>[country.code,country]));
  const withWebcams=new Set(webcamCountries);
  const canvas=document.createElement('canvas');canvas.className='world-globe-canvas';canvas.tabIndex=0;
  canvas.setAttribute('role','application');canvas.setAttribute('aria-label','Interactive world globe. Drag to rotate, use arrow keys to explore, and press Enter to choose the country at the centre. Use plus or minus to zoom.');
  canvas.setAttribute('aria-keyshortcuts','ArrowLeft ArrowRight ArrowUp ArrowDown Enter + -');
  container.replaceChildren(canvas);container.dataset.globeReady='false';
  let gl, dead=false, frame=0, observer, image;
  let lon=-35,lat=18,distance=3.3,targetLon=lon,targetLat=lat,targetDistance=distance,aspect=1;
  let selection='',selectedCount=0,hoverCode='',dragged=false,pinched=false,startX=0,startY=0,pinchStart=0,pinchDistance=0;
  const controls=new AbortController();const pointers=new Map();const buffers=[],programs=[];
  const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal:controls.signal});
  const fallback=()=>{
    if(dead)return;container.dataset.globeReady='false';
    const message=document.createElement('p');message.className='world-globe-fallback';message.setAttribute('role','status');
    message.textContent='The globe needs WebGL graphics. You can still choose any country from the country list.';container.replaceChildren(message);
    cancelAnimationFrame(frame);frame=0;
  };
  const schedule=()=>{if(!dead&&!frame&&gl&&!gl.isContextLost())frame=requestAnimationFrame(draw);};
  const zoom=delta=>{targetDistance=clamp(1+(targetDistance-1)*Math.exp(-Number(delta||0)*.22),1.04,5.2);schedule();};
  const reset=()=>{targetLon=-35;targetLat=18;targetDistance=3.3;schedule();};
  function destroy(){
    if(dead)return;dead=true;controls.abort();signal?.removeEventListener('abort',destroy);observer?.disconnect();cancelAnimationFrame(frame);
    if(image)image.onload=image.onerror=null;
    if(gl){for(const buffer of buffers)gl.deleteBuffer(buffer);for(const p of programs)gl.deleteProgram(p.handle);if(texture)gl.deleteTexture(texture);gl.getExtension('WEBGL_lose_context')?.loseContext();}
    container.dataset.globeReady='false';pointers.clear();
  }
  const api={select,zoom,reset,destroy};
  let sphere,earth,line,atmosphere,vertexBuffer,indexBuffer,borderBuffer,webcamBuffer,selectedBuffer,markerBuffer,texture;
  let borderCount=0,webcamCount=0,indexCount=0;
  function buffer(data,target){const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b;}
  function select(code){
    const country=byCode.get(code);if(!country)return;
    selection=code;targetLon=country.lon;targetLat=clamp(country.lat,-85,85);targetDistance=countryDistance(country,aspect);
    canvas.setAttribute('aria-label',`${country.name} selected. Interactive world globe. Drag or use arrow keys to rotate; press Enter to choose the centre country.`);
    if(gl&&selectedBuffer){const points=outlineVertices([country]);selectedCount=points.length/3;gl.bindBuffer(gl.ARRAY_BUFFER,selectedBuffer);gl.bufferData(gl.ARRAY_BUFFER,points,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,markerBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(spherePoint(country.lon,country.lat)),gl.DYNAMIC_DRAW);}
    container.dataset.selectedCountry=code;schedule();
  }
  if(signal?.aborted){destroy();return api;}signal?.addEventListener('abort',destroy,{once:true});
  try{
    gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power'});
    if(!gl)throw Error('WebGL unavailable');
    earth=program(gl,VERTEX,EARTH_FRAGMENT);line=program(gl,VERTEX,LINE_FRAGMENT);atmosphere=program(gl,VERTEX,ATMOSPHERE_FRAGMENT);programs.push(earth,line,atmosphere);
    sphere=sphereMesh();vertexBuffer=buffer(sphere.vertices,gl.ARRAY_BUFFER);indexBuffer=buffer(sphere.indices,gl.ELEMENT_ARRAY_BUFFER);indexCount=sphere.indices.length;
    const borders=outlineVertices(rows);borderBuffer=buffer(borders,gl.ARRAY_BUFFER);borderCount=borders.length/3;
    const webcamBorders=outlineVertices(rows.filter(country=>withWebcams.has(country.code)));
    webcamBuffer=buffer(webcamBorders,gl.ARRAY_BUFFER);webcamCount=webcamBorders.length/3;
    selectedBuffer=buffer(new Float32Array(),gl.ARRAY_BUFFER);markerBuffer=buffer(new Float32Array(),gl.ARRAY_BUFFER);
    texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([25,65,102]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    image=new Image();image.decoding='async';image.onload=()=>{
      if(dead||gl.isContextLost())return;gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);container.dataset.textureLoaded='true';schedule();
    };image.onerror=()=>{container.dataset.textureLoaded='false';schedule();};image.src=new URL('../assets/world-earth.jpg',import.meta.url).href;
    container.dataset.globeReady='true';
  }catch{fallback();return api;}

  function use(p,radius=1){
    gl.useProgram(p.handle);gl.uniform2f(p.rotation,lon*RAD,lat*RAD);gl.uniform1f(p.distance,distance);gl.uniform1f(p.aspect,aspect);gl.uniform1f(p.radius,radius);
  }
  function bindSphere(p){
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.enableVertexAttribArray(p.position);gl.vertexAttribPointer(p.position,3,gl.FLOAT,false,20,0);
    if(p.uv>=0){gl.enableVertexAttribArray(p.uv);gl.vertexAttribPointer(p.uv,2,gl.FLOAT,false,20,12);}
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);
  }
  function draw(){
    frame=0;if(dead||gl.isContextLost())return;
    const dLon=longitude(targetLon-lon),dLat=targetLat-lat,dDistance=targetDistance-distance;
    const moving=Math.abs(dLon)>.005||Math.abs(dLat)>.005||Math.abs(dDistance)>.0005;
    if(moving){lon=longitude(lon+dLon*.18);lat+=dLat*.18;distance+=dDistance*.18;}else{lon=longitude(targetLon);lat=targetLat;distance=targetDistance;}
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.025,.012,.065,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    use(atmosphere,1.025);bindSphere(atmosphere);gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);
    gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);
    use(earth);bindSphere(earth);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(earth.texture,0);gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);
    if(earth.uv>=0)gl.disableVertexAttribArray(earth.uv);
    use(line,1.001);gl.bindBuffer(gl.ARRAY_BUFFER,borderBuffer);gl.enableVertexAttribArray(line.position);gl.vertexAttribPointer(line.position,3,gl.FLOAT,false,12,0);gl.uniform4f(line.color,.63,.67,.72,1);gl.drawArrays(gl.LINES,0,borderCount);
    if(webcamCount){gl.bindBuffer(gl.ARRAY_BUFFER,webcamBuffer);gl.vertexAttribPointer(line.position,3,gl.FLOAT,false,12,0);gl.uniform4f(line.color,.37,.92,.83,1);gl.drawArrays(gl.LINES,0,webcamCount);}
    if(selection&&selectedCount){gl.bindBuffer(gl.ARRAY_BUFFER,selectedBuffer);gl.vertexAttribPointer(line.position,3,gl.FLOAT,false,12,0);gl.uniform4f(line.color,1,.85,.08,1);gl.drawArrays(gl.LINES,0,selectedCount);}
    if(selection){use(line,1.003);gl.bindBuffer(gl.ARRAY_BUFFER,markerBuffer);gl.vertexAttribPointer(line.position,3,gl.FLOAT,false,12,0);gl.uniform4f(line.color,1,.85,.08,1);gl.drawArrays(gl.POINTS,0,1);}
    container.dataset.longitude=lon.toFixed(3);container.dataset.latitude=lat.toFixed(3);container.dataset.distance=distance.toFixed(3);
    if(moving)schedule();
  }
  function resize(){
    if(dead)return;const box=container.getBoundingClientRect();const width=Math.max(1,box.width),height=Math.max(1,box.height);aspect=width/height;
    const ratio=Math.min(devicePixelRatio||1,2);canvas.width=Math.min(4096,Math.round(width*ratio));canvas.height=Math.min(4096,Math.round(height*ratio));
    if(byCode.has(selection))targetDistance=countryDistance(byCode.get(selection),aspect);schedule();
  }
  function picked(x,y){const box=canvas.getBoundingClientRect();return countryAt(rows,globePointAt(2*(x-box.left)/box.width-1,1-2*(y-box.top)/box.height,{lon,lat,distance,aspect}));}
  function hover(country){const code=country?.code??'';if(code!==hoverCode){hoverCode=code;container.dataset.hoverCountry=code;onHover(country??null);}}
  function commit(country){if(country){select(country.code);onSelect(country);}}
  function pinchLength(){const points=[...pointers.values()];return Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);}
  listen(canvas,'pointerdown',event=>{
    if(event.button!==0&&event.pointerType==='mouse')return;
    canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointers.size===1){startX=event.clientX;startY=event.clientY;dragged=false;pinched=false;}
    if(pointers.size===2){pinched=true;pinchStart=pinchLength();pinchDistance=targetDistance;}
    canvas.classList.add('world-globe-dragging');
  });
  listen(canvas,'pointermove',event=>{
    const previous=pointers.get(event.pointerId);
    if(previous){
      const dx=event.clientX-previous.x,dy=event.clientY-previous.y;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(Math.hypot(event.clientX-startX,event.clientY-startY)>5)dragged=true;
      if(pointers.size>=2&&pinchStart){targetDistance=clamp(1+(pinchDistance-1)*pinchStart/Math.max(1,pinchLength()),1.04,5.2);}
      else{const sensitivity=.35*clamp((distance-1)/2.3,.08,1.7);targetLon=lon=longitude(lon-dx*sensitivity);targetLat=lat=clamp(lat+dy*sensitivity,-85,85);}
      hover(null);schedule();
    }else hover(picked(event.clientX,event.clientY));
  });
  const endPointer=(event,cancelled=false)=>{
    const known=pointers.has(event.pointerId);pointers.delete(event.pointerId);
    if(known&&!cancelled&&!dragged&&!pinched)commit(picked(event.clientX,event.clientY));
    if(!pointers.size)canvas.classList.remove('world-globe-dragging');
  };
  listen(canvas,'pointerup',event=>endPointer(event));listen(canvas,'pointercancel',event=>endPointer(event,true));listen(canvas,'lostpointercapture',event=>endPointer(event,true));
  listen(canvas,'pointerleave',()=>{if(!pointers.size)hover(null);});
  listen(canvas,'wheel',event=>{event.preventDefault();zoom(-clamp(event.deltaY/100,-3,3));},{passive:false});
  listen(canvas,'keydown',event=>{
    const actions={ArrowLeft:()=>{targetLon-=8;},ArrowRight:()=>{targetLon+=8;},ArrowUp:()=>{targetLat=clamp(targetLat+8,-85,85);},ArrowDown:()=>{targetLat=clamp(targetLat-8,-85,85);},Enter:()=>commit(countryAt(rows,{lon,lat})), ' ':()=>commit(countryAt(rows,{lon,lat})), '+':()=>zoom(1),'=':()=>zoom(1),'-':()=>zoom(-1),Home:reset};
    if(actions[event.key]){event.preventDefault();event.stopPropagation();actions[event.key]();schedule();}
  });
  listen(canvas,'webglcontextlost',event=>{event.preventDefault();fallback();});
  observer=new ResizeObserver(resize);observer.observe(container);resize();if(selected)select(selected);schedule();
  return api;
}
