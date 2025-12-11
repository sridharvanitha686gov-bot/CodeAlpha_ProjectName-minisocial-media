const api = (path, opts={}) => fetch('/api'+path, opts).then(r=>r.json());
const token = ()=>localStorage.getItem('token');
const headers = (more={}) => ({ 'Content-Type':'application/json', ...more, ...(token() ? { Authorization:'Bearer '+token() } : {}) });
const main = document.getElementById('main');

function show(el){ main.innerHTML=''; main.appendChild(el); }

function el(tag, attrs={}, ...children){ const e=document.createElement(tag); for(let k in attrs){ if(k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); } children.forEach(c=> typeof c==='string' ? e.appendChild(document.createTextNode(c)) : e.appendChild(c)); return e; }

async function loadFeed(){
  const data = await api('/posts');
  const container = el('div');
  container.appendChild(el('h2',{},'Feed'));
  const me = await (token() ? api('/me',{headers:headers()}) : null);
  if(me){
    const form = el('div',{}, el('textarea',{id:'content',placeholder:'What\'s happening?'}), el('button',{onClick:async ()=>{ const content=document.getElementById('content').value; await fetch('/api/posts',{method:'POST',headers:headers(),body:JSON.stringify({content})}); loadFeed(); }},'Post'));
    container.appendChild(form);
  } else {
    const loginLink = el('button',{onClick:showLogin},'Login / Register to post');
    container.appendChild(loginLink);
  }
  data.forEach(p=>{
    const card = el('div',{class:'post'}, el('div',{}, el('strong',{}, p.User.displayName || p.User.username), ' @', p.User.username ), el('div',{}, p.content), el('div', {class:'controls'}, el('span',{}, 'Likes: '+(p.Likers ? p.Likers.length : 0)), el('button',{onClick:async ()=>{ if(!token()){alert('login first');return;} await fetch('/api/posts/'+p.id+'/like',{method:'POST',headers:headers()}); loadFeed(); }},'Like') ));
    // comments
    if(p.Comments && p.Comments.length){
      const cList = el('div',{}, el('small',{},'Comments:'), ...p.Comments.map(c=> el('div',{}, el('strong',{}, c.User.displayName || c.User.username), ': ', c.content)));
      card.appendChild(cList);
    }
    container.appendChild(card);
  });
  show(container);
}

function showLogin(){
  const container = el('div');
  container.appendChild(el('h2',{},'Login / Register'));
  const user = el('input',{placeholder:'username',id:'username'});
  const pass = el('input',{placeholder:'password',id:'password', type:'password'});
  const name = el('input',{placeholder:'display name',id:'displayName'});
  container.appendChild(user); container.appendChild(pass); container.appendChild(name);
  const loginBtn = el('button',{onClick:async ()=>{ const username=user.value, password=pass.value; const res=await fetch('/api/login',{method:'POST',headers:headers(),body:JSON.stringify({username,password})}); const j=await res.json(); if(j.token){ localStorage.setItem('token', j.token); loadFeed(); } else alert(j.error || 'error'); }},'Login');
  const regBtn = el('button',{onClick:async ()=>{ const username=user.value, password=pass.value, displayName=name.value; const res=await fetch('/api/register',{method:'POST',headers:headers(),body:JSON.stringify({username,password,displayName})}); const j=await res.json(); if(j.token){ localStorage.setItem('token', j.token); loadFeed(); } else alert(j.error || 'error'); }},'Register');
  container.appendChild(loginBtn); container.appendChild(regBtn);
  show(container);
}

// initial
loadFeed();
