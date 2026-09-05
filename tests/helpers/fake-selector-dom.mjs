/** Minimal DOM for selector ownership tests; rendering is checked in the browser separately. */
export class SelectorElement {
  children=[]; listeners=new Map(); attributes=new Map(); textContent=''; className='';
  classList={toggle(){}};
  constructor(tag='div') { this.tagName=tag.toUpperCase(); }
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  addEventListener(name,fn){this.listeners.set(name,fn);}
  replaceChildren(...children){this.children=children;}
  appendChild(child){this.children.push(child);return child;}
  click(){this.listeners.get('click')?.();}
}
export const selectorDocument={createElement:tag=>new SelectorElement(tag)};
