import { 
    auth, db, googleProvider, signInWithPopup, signInWithEmailAndPassword, 
    onAuthStateChanged, signOut, sendPasswordResetEmail, collection, addDoc, getDocs, doc, getDoc, setDoc,
    query, orderBy, updateDoc, deleteDoc, where 
} from './firebase.js';

// Inicializa Ícones
lucide.createIcons();

// Variáveis de Estado Global
let currentUser = null;
let userProfile = null;
let currentNovelId = null;
let currentNovelData = null;
let currentChapterId = null;
let currentChaptersList = [];
let fontSize = parseInt(localStorage.getItem('ln_fontsize')) || 18;
let allNovelsCache = [];
let currentViewingAuthorID = null;

// Elementos DOM
const views = document.querySelectorAll('.view');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');

// --- SISTEMA DE ROTEAMENTO SPA ---
function navigateTo(viewId, pushHistory = true) {
    views.forEach(view => view.classList.add('hidden'));
    const targetView = document.getElementById(`view-${viewId}`);
    if(targetView) targetView.classList.remove('hidden');
    
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    
    if (pushHistory) {
        let route = viewId === 'home' ? '/' : `/${viewId}`;
        if (viewId !== 'novel' && viewId !== 'reader') {
            history.pushState({ viewId }, "", route);
        }
    }

    if(viewId === 'home') loadHomeNovels();
    if(viewId === 'perfil') loadProfileView();
    if(viewId === 'minhas-novels') loadMinhasNovels();
    if(viewId === 'favoritos') loadFavoritos();
    if(viewId === 'historico') loadHistorico();
    
    window.scrollTo(0,0);
}

// Escuta os botões Voltar/Avançar do navegador
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.viewId) {
        if (e.state.viewId === 'novel') {
            openNovel(e.state.novelId, false);
        } else if (e.state.viewId === 'reader') {
            openReader(e.state.capId, null, false);
        } else {
            navigateTo(e.state.viewId, false);
        }
    } else {
        handleInitialRoute();
    }
});

function handleInitialRoute() {
    const path = window.location.pathname.replace(/^\/|\/$/g, '');
    
    if (!path || path === 'home') {
        navigateTo('home', false);
    } else if (['upload-novel', 'minhas-novels', 'perfil', 'public-profile', 'edit-novel', 'upload-chapter', 'favoritos', 'historico'].includes(path)) {
        navigateTo(path, false);
    } else if (path.startsWith('capitulo-')) {
        const capId = path.replace('capitulo-', '');
        openReader(capId, null, false);
    } else {
        const possibleId = path.split('-').pop(); 
        if (possibleId && possibleId.length > 10) { 
            openNovel(possibleId, false);
        } else {
            navigateTo('home', false); 
        }
    }
}

document.querySelectorAll('[data-link]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(e.currentTarget.getAttribute('data-link'));
    });
});

document.getElementById('back-to-novel-btn').addEventListener('click', () => openNovel(currentNovelId));
document.getElementById('back-to-novel-from-edit-btn').addEventListener('click', () => openNovel(currentNovelId));
document.getElementById('back-from-public-profile-btn').addEventListener('click', () => {
    if(currentNovelId) openNovel(currentNovelId);
    else navigateTo('home');
});

// --- MENU HAMBÚRGUER ---
document.getElementById('menu-btn').addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
});
document.getElementById('close-menu-btn').addEventListener('click', closeMenu);
overlay.addEventListener('click', closeMenu);
function closeMenu() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// --- MODAIS ---
const loginModal = document.getElementById('login-modal');
document.getElementById('login-link').addEventListener('click', () => { closeMenu(); loginModal.classList.remove('hidden'); });
document.querySelector('.close-modal').addEventListener('click', () => loginModal.classList.add('hidden'));

const sobreModal = document.getElementById('sobre-modal');
document.getElementById('sobre-link').addEventListener('click', (e) => { e.preventDefault(); closeMenu(); sobreModal.classList.remove('hidden'); });
document.querySelector('.close-sobre-modal').addEventListener('click', () => sobreModal.classList.add('hidden'));

const regrasModal = document.getElementById('regras-modal');
document.getElementById('regras-link').addEventListener('click', (e) => { e.preventDefault(); closeMenu(); regrasModal.classList.remove('hidden'); });
document.querySelector('.close-regras-modal').addEventListener('click', () => regrasModal.classList.add('hidden'));

const privacidadeModal = document.getElementById('privacidade-modal');
document.getElementById('privacidade-link').addEventListener('click', (e) => { e.preventDefault(); closeMenu(); privacidadeModal.classList.remove('hidden'); });
document.querySelector('.close-privacidade-modal').addEventListener('click', () => privacidadeModal.classList.add('hidden'));

// Modal de Doações
const doacoesModal = document.getElementById('doacoes-modal');
document.getElementById('doacoes-link').addEventListener('click', (e) => { e.preventDefault(); closeMenu(); doacoesModal.classList.remove('hidden'); });
document.querySelector('.close-doacoes-modal').addEventListener('click', () => doacoesModal.classList.add('hidden'));

// Lógica de valores de doação
const donationBtns = document.querySelectorAll('.btn-donation');
donationBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        donationBtns.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const val = e.currentTarget.getAttribute('data-val');
        
        const title = document.getElementById('donation-title');
        const img = document.getElementById('donation-qr-img');
        
        if(val === 'custom') {
            title.textContent = 'Doe o valor que preferir via PIX';
            img.src = "https://via.placeholder.com/200x200.png?text=QR+Code+Livre"; // QR Code Personalizado
        } else {
            title.textContent = `Doar R$ ${val},00 via PIX`;
            img.src = `https://via.placeholder.com/200x200.png?text=QR+Code+R$${val}`; // QR Codes Fixos
        }
    });
});

// --- AUTENTICAÇÃO E PERFIL ---
onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    const authReqEls = document.querySelectorAll('.auth-required');
    const profileSummary = document.getElementById('sidebar-profile-summary');
    
    if (user) {
        document.getElementById('login-link').classList.add('hidden');
        document.getElementById('logout-link').classList.remove('hidden');
        authReqEls.forEach(el => el.style.display = 'flex');
        loginModal.classList.add('hidden');
        profileSummary.classList.remove('hidden');

        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if(!userSnap.exists()) {
            const newProfile = {
                username: user.displayName || 'Novo Usuário',
                bio: '',
                avatarURL: user.photoURL || 'https://ui-avatars.com/api/?name=User&background=random',
                email: user.email,
                favoritos: [],
                historico: []
            };
            await setDoc(userRef, newProfile);
            userProfile = newProfile;
        } else {
            userProfile = userSnap.data();
            // Garante que as arrays existam para usuários antigos
            if(!userProfile.favoritos) userProfile.favoritos = [];
            if(!userProfile.historico) userProfile.historico = [];
        }

        document.getElementById('sidebar-username').textContent = userProfile.username;
        document.getElementById('sidebar-avatar').src = userProfile.avatarURL;

    } else {
        userProfile = null;
        document.getElementById('login-link').classList.remove('hidden');
        document.getElementById('logout-link').classList.add('hidden');
        authReqEls.forEach(el => el.style.display = 'none');
        profileSummary.classList.add('hidden');
        if(window.location.pathname === '/' || window.location.pathname === '/home'){
           navigateTo('home', false);
        }
    }
});

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('login-email').value, document.getElementById('login-password').value);
    } catch (error) { alert("Erro ao fazer login. Verifique seu email e senha."); }
});
document.getElementById('btn-google-login').addEventListener('click', async () => {
    try { 
        await signInWithPopup(auth, googleProvider); 
    } catch (error) { 
        console.error(error);
        alert("Ocorreu um erro ao logar com o Google. Se estiver no celular, tente abrir no navegador principal (Chrome/Safari) ou use seu E-mail e Senha."); 
    }
});
document.getElementById('logout-link').addEventListener('click', () => signOut(auth));

// --- MEU PERFIL ---
function loadProfileView() {
    if(!userProfile) return;
    document.getElementById('profile-username').value = userProfile.username;
    document.getElementById('profile-avatar').value = userProfile.avatarURL;
    document.getElementById('profile-bio').value = userProfile.bio;
    document.getElementById('profile-email').value = currentUser.email;
    document.getElementById('profile-avatar-preview').src = userProfile.avatarURL;
}

document.getElementById('form-profile').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newUsername = document.getElementById('profile-username').value;
    const newAvatar = document.getElementById('profile-avatar').value || 'https://ui-avatars.com/api/?name='+newUsername;
    const newBio = document.getElementById('profile-bio').value;

    try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            username: newUsername, avatarURL: newAvatar, bio: newBio
        });
        userProfile.username = newUsername; userProfile.avatarURL = newAvatar; userProfile.bio = newBio;
        document.getElementById('sidebar-username').textContent = newUsername;
        document.getElementById('sidebar-avatar').src = newAvatar;
        document.getElementById('profile-avatar-preview').src = newAvatar;
        alert("Perfil atualizado com sucesso!");
    } catch (e) { alert("Erro ao atualizar perfil: " + e.message); }
});

document.getElementById('btn-reset-password').addEventListener('click', async () => {
    try {
        await sendPasswordResetEmail(auth, currentUser.email);
        alert("E-mail de redefinição de senha enviado para: " + currentUser.email);
    } catch (e) { alert("Erro ao enviar e-mail: " + e.message); }
});

// --- BANCO DE DADOS E NAVEGAÇÃO HOME ---
document.getElementById('search-toggle-btn').addEventListener('click', () => {
    document.getElementById('search-bar-container').classList.toggle('hidden');
});

async function populateCacheIfNeeded() {
    if(allNovelsCache.length === 0) {
        const querySnapshot = await getDocs(collection(db, "lightnovels"));
        allNovelsCache = [];
        querySnapshot.forEach((doc) => allNovelsCache.push({ id: doc.id, ...doc.data() }));
    }
}

async function loadHomeNovels() {
    const grid = document.getElementById('novels-grid');
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Carregando...</p>';
    try {
        await populateCacheIfNeeded();
        renderHome(allNovelsCache);
    } catch (e) { console.error("Erro", e); grid.innerHTML = '<p>Erro ao carregar.</p>'; }
}

function renderHome(novels) {
    const grid = document.getElementById('novels-grid');
    grid.innerHTML = '';

    const searchText = document.getElementById('search-input').value.toLowerCase();
    const searchGenre = document.getElementById('search-genre').value;
    const show18 = document.getElementById('filter-18').checked;
    const showSensible = document.getElementById('filter-sensible').checked;
    const showGore = document.getElementById('filter-gore').checked;

    let filtered = novels.filter(novel => {
        const matchText = novel.titulo.toLowerCase().includes(searchText) || novel.autorNome.toLowerCase().includes(searchText);
        const matchGenre = searchGenre === "" || novel.genero === searchGenre;
        
        let matchTags = true;
        if(novel.tags?.adult && !show18) matchTags = false;
        if(novel.tags?.sensible && !showSensible) matchTags = false;
        if(novel.tags?.gore && !showGore) matchTags = false;

        return matchText && matchGenre && matchTags;
    });

    if(filtered.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center;">Nenhuma novel encontrada com estes filtros.</p>';
        return;
    }

    filtered.forEach((data) => {
        const card = document.createElement('div');
        card.className = 'card';
        
        let tagsHtml = '';
        if(data.tags?.adult) tagsHtml += '<span class="tag-badge">+18</span>';
        else if(data.tags?.gore) tagsHtml += '<span class="tag-badge">Gore</span>';

        let avgRatingHome = 0;
        if (data.ratings && Object.keys(data.ratings).length > 0) {
            const total = Object.values(data.ratings).reduce((a,b)=>a+b, 0);
            avgRatingHome = (total / Object.keys(data.ratings).length).toFixed(1);
        }

        card.innerHTML = `
            ${tagsHtml}
            <img src="${data.capaURL}" alt="Capa" loading="lazy">
            <div class="card-info">
                <h3>${data.titulo}</h3>
                <p>${data.genero} • <i data-lucide="star" style="width:12px; height:12px; color:var(--star-color); display:inline-block; fill:var(--star-color);"></i> ${avgRatingHome > 0 ? avgRatingHome : 'N/A'}</p>
                <p style="font-size: 0.75rem;">Por: ${data.autorNome}</p>
            </div>
        `;
        card.addEventListener('click', () => openNovel(data.id));
        grid.appendChild(card);
    });
    lucide.createIcons();
}

document.getElementById('search-input').addEventListener('input', () => renderHome(allNovelsCache));
document.getElementById('search-genre').addEventListener('change', () => renderHome(allNovelsCache));
document.querySelectorAll('.home-filter').forEach(chk => chk.addEventListener('change', () => renderHome(allNovelsCache)));

// --- FAVORITOS E HISTÓRICO ---
async function loadFavoritos() {
    if(!currentUser || !userProfile) return;
    const grid = document.getElementById('favoritos-grid');
    grid.innerHTML = '<p>Buscando favoritos...</p>';
    await populateCacheIfNeeded();
    
    grid.innerHTML = '';
    const favs = allNovelsCache.filter(novel => userProfile.favoritos && userProfile.favoritos.includes(novel.id));
    
    if(favs.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1;">Você ainda não tem obras favoritas.</p>';
        return;
    }

    favs.forEach((data) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<img src="${data.capaURL}"> <div class="card-info"><h3>${data.titulo}</h3></div>`;
        card.addEventListener('click', () => openNovel(data.id));
        grid.appendChild(card);
    });
}

async function loadHistorico() {
    if(!currentUser || !userProfile) return;
    const grid = document.getElementById('historico-grid');
    grid.innerHTML = '<p>Buscando histórico...</p>';
    await populateCacheIfNeeded();
    
    grid.innerHTML = '';
    const hist = userProfile.historico || [];
    const histNovels = hist.map(id => allNovelsCache.find(n => n.id === id)).filter(Boolean); // Remove nulos
    
    if(histNovels.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1;">Você ainda não leu nenhuma obra.</p>';
        return;
    }

    histNovels.forEach((data) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<img src="${data.capaURL}"> <div class="card-info"><h3>${data.titulo}</h3></div>`;
        card.addEventListener('click', () => openNovel(data.id));
        grid.appendChild(card);
    });
}

// 2. Upload de Novel Nova
document.getElementById('form-upload-novel').addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!currentUser || !userProfile) return alert("Faça login e configure seu perfil primeiro!");

    const novelData = {
        titulo: document.getElementById('novel-title').value,
        sinopse: document.getElementById('novel-synopsis').value,
        capaURL: document.getElementById('novel-cover').value,
        genero: document.getElementById('novel-genre').value,
        autorUID: currentUser.uid,
        autorNome: userProfile.username,
        temVolumes: document.getElementById('tag-volumes').checked,
        ratings: {},
        tags: {
            adult: document.getElementById('tag-18').checked,
            sensible: document.getElementById('tag-sensible').checked,
            gore: document.getElementById('tag-gore').checked
        },
        curtidas: 0,
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, "lightnovels"), novelData);
        alert("Light Novel publicada com sucesso!");
        e.target.reset();
        allNovelsCache = []; 
        navigateTo('home');
    } catch (e) { alert("Erro ao publicar: " + e.message); }
});

// 3. Aba Minhas Novels
async function loadMinhasNovels() {
    if(!currentUser) return;
    const grid = document.getElementById('minhas-novels-grid');
    grid.innerHTML = '<p>Carregando suas obras...</p>';
    
    try {
        const q = query(collection(db, "lightnovels"), where("autorUID", "==", currentUser.uid));
        const snap = await getDocs(q);
        grid.innerHTML = '';
        
        if(snap.empty) { grid.innerHTML = '<p>Você ainda não publicou nenhuma novel.</p>'; return; }
        
        snap.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `<img src="${data.capaURL}"> <div class="card-info"><h3>${data.titulo}</h3></div>`;
            card.addEventListener('click', () => openNovel(doc.id));
            grid.appendChild(card);
        });
    } catch(e) { console.error(e); grid.innerHTML="Erro ao carregar.";}
}

// 4. Abrir Detalhes da Novel
async function openNovel(novelId, pushHistory = true) {
    currentNovelId = novelId;
    navigateTo('novel', false); 
    
    const content = document.getElementById('novel-details-content');
    content.innerHTML = '<p>Carregando...</p>';
    
    try {
        const docRef = doc(db, "lightnovels", novelId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentNovelData = data; 
            const isAuthor = currentUser && currentUser.uid === data.autorUID;
            
            if (pushHistory) {
                const slug = data.titulo.toString().toLowerCase().trim()
                    .replace(/[\s\W-]+/g, '-')
                    .replace(/\-$/, ''); 
                
                history.pushState({ viewId: 'novel', novelId: novelId }, "", `/${slug}-${novelId}`);
            }

            const btnAddChapter = document.getElementById('btn-add-chapter');
            const btnEditNovel = document.getElementById('btn-edit-novel');
            
            if(isAuthor) {
                btnAddChapter.classList.remove('hidden');
                btnEditNovel.classList.remove('hidden');
                btnAddChapter.onclick = () => {
                    document.getElementById('chapter-volume-container').style.display = data.temVolumes ? 'block' : 'none';
                    if(!data.temVolumes) document.getElementById('chapter-volume').value = '1';
                    navigateTo('upload-chapter');
                };
                btnEditNovel.onclick = () => openEditNovel(novelId, data);
            } else { 
                btnAddChapter.classList.add('hidden'); 
                btnEditNovel.classList.add('hidden');
            }

            let tagsUI = `<div class="novel-tags">`;
            if(data.tags?.adult) tagsUI += `<span class="alert">+18</span>`;
            if(data.tags?.gore) tagsUI += `<span class="alert">Gore</span>`;
            if(data.tags?.sensible) tagsUI += `<span>Temas Sensíveis</span>`;
            if(data.temVolumes) tagsUI += `<span>Dividido em Volumes</span>`;
            tagsUI += `</div>`;

            let ratings = data.ratings || {};
            let totalRatings = Object.keys(ratings).length;
            let avgRating = totalRatings > 0 ? (Object.values(ratings).reduce((a,b)=>a+b,0) / totalRatings).toFixed(1) : 0;
            
            let starsHTML = '';
            for(let i=1; i<=5; i++) {
                let fillClass = i <= Math.round(avgRating) ? 'filled' : '';
                starsHTML += `<i data-lucide="star" class="star ${fillClass}" data-val="${i}"></i>`;
            }

            // Verifica se está nos favoritos
            let isFavorito = userProfile && userProfile.favoritos && userProfile.favoritos.includes(novelId);
            let btnFavIcon = isFavorito ? `<i data-lucide="bookmark-minus" style="width:18px; height:18px;"></i> Desfavoritar` : `<i data-lucide="bookmark-plus" style="width:18px; height:18px;"></i> Favoritar`;

            content.innerHTML = `
                <div class="novel-header">
                    <img src="${data.capaURL}" alt="Capa">
                    <div class="novel-info">
                        <h2>${data.titulo}</h2>
                        <p><strong>Autor:</strong> ${data.autorNome}</p>
                        <p><strong>Gênero:</strong> ${data.genero}</p>
                        
                        <div class="star-rating" id="novel-star-rating">
                            ${starsHTML}
                            <span>(${avgRating} / 5) - ${totalRatings} avaliações</span>
                        </div>

                        ${tagsUI}
                        <div style="display: flex; gap: 10px; margin-top:15px; flex-wrap: wrap;">
                            <button id="btn-like" class="btn-primary" style="width:auto; display:flex; align-items:center; gap:5px; margin: 0;">
                                <i data-lucide="heart" style="width:18px; height:18px;"></i> Curtir (${data.curtidas || 0})
                            </button>
                            <button id="btn-favorite" class="btn-secondary" style="width:auto; display:flex; align-items:center; gap:5px; margin: 0; padding: 12px; color: ${isFavorito ? 'var(--primary-color)' : ''};">
                                ${btnFavIcon}
                            </button>
                            <button id="btn-view-author" class="btn-secondary" style="width:auto; display:flex; align-items:center; gap:5px; margin: 0; padding: 12px;">
                                <i data-lucide="user" style="width:18px; height:18px;"></i> Ver perfil do autor
                            </button>
                            <button id="btn-share" class="btn-secondary" style="width:auto; display:flex; align-items:center; gap:5px; margin: 0; padding: 12px;">
                                <i data-lucide="share-2" style="width:18px; height:18px;"></i> Compartilhar
                            </button>
                        </div>
                    </div>
                </div>
                <div style="background:var(--surface-color); padding: 15px; border-radius:8px; margin-top:20px;">
                    <h3>Sinopse</h3>
                    <p style="margin-top:10px; color:var(--text-muted);">${data.sinopse}</p>
                </div>
                <h3 style="margin-top:30px;">Capítulos</h3>
            `;
            lucide.createIcons();

            // Interação de Estrelas
            const starElements = document.querySelectorAll('.star-rating .star');
            starElements.forEach(star => {
                star.addEventListener('click', async (e) => {
                    if(!currentUser) return alert("Faça login para avaliar!");
                    const val = parseInt(e.currentTarget.getAttribute('data-val'));
                    let newRatings = data.ratings || {};
                    newRatings[currentUser.uid] = val;
                    await updateDoc(docRef, { ratings: newRatings });
                    allNovelsCache = [];
                    openNovel(novelId, false);
                });
                star.addEventListener('mouseover', (e) => {
                    const val = parseInt(e.currentTarget.getAttribute('data-val'));
                    starElements.forEach(s => {
                        if(parseInt(s.getAttribute('data-val')) <= val) s.classList.add('hovered');
                        else s.classList.remove('hovered');
                    });
                });
                star.addEventListener('mouseout', () => starElements.forEach(s => s.classList.remove('hovered')));
            });

            document.getElementById('btn-like').addEventListener('click', async () => {
                if(!currentUser) return alert("Faça login para curtir!");
                await updateDoc(docRef, { curtidas: (data.curtidas || 0) + 1 });
                openNovel(novelId, false); 
            });

            // Botão de Favoritar
            document.getElementById('btn-favorite').addEventListener('click', async () => {
                if(!currentUser) return alert("Faça login para favoritar!");
                let favs = userProfile.favoritos || [];
                if(favs.includes(novelId)) {
                    favs = favs.filter(id => id !== novelId);
                } else {
                    favs.push(novelId);
                }
                userProfile.favoritos = favs;
                await updateDoc(doc(db, 'users', currentUser.uid), { favoritos: favs });
                openNovel(novelId, false);
            });

            document.getElementById('btn-view-author').addEventListener('click', () => {
                openPublicProfile(data.autorUID);
            });

            document.getElementById('btn-share').addEventListener('click', () => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    alert("Link copiado para a área de transferência!");
                }).catch(err => {
                    alert("Não foi possível copiar o link automaticamente.");
                });
            });

            loadChapters(novelId, isAuthor);
        }
    } catch (e) { console.error("Erro ao carregar novel", e); }
}

// 5. Editar Novel
function openEditNovel(novelId, data) {
    document.getElementById('edit-novel-title').value = data.titulo;
    document.getElementById('edit-novel-synopsis').value = data.sinopse;
    document.getElementById('edit-novel-cover').value = data.capaURL;
    document.getElementById('edit-novel-genre').value = data.genero;
    
    document.getElementById('edit-tag-volumes').checked = data.temVolumes || false;
    document.getElementById('edit-tag-18').checked = data.tags?.adult || false;
    document.getElementById('edit-tag-sensible').checked = data.tags?.sensible || false;
    document.getElementById('edit-tag-gore').checked = data.tags?.gore || false;

    navigateTo('edit-novel');
}

document.getElementById('form-edit-novel').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const updatedData = {
        titulo: document.getElementById('edit-novel-title').value,
        sinopse: document.getElementById('edit-novel-synopsis').value,
        capaURL: document.getElementById('edit-novel-cover').value,
        genero: document.getElementById('edit-novel-genre').value,
        temVolumes: document.getElementById('edit-tag-volumes').checked,
        tags: {
            adult: document.getElementById('edit-tag-18').checked,
            sensible: document.getElementById('edit-tag-sensible').checked,
            gore: document.getElementById('edit-tag-gore').checked
        }
    };

    try {
        await updateDoc(doc(db, "lightnovels", currentNovelId), updatedData);
        alert("Light Novel atualizada com sucesso!");
        allNovelsCache = []; 
        openNovel(currentNovelId, false); 
    } catch (err) { alert("Erro ao editar: " + err.message); }
});

// 6. Perfil Público
async function openPublicProfile(autorUID) {
    currentViewingAuthorID = autorUID;
    navigateTo('public-profile');
    
    document.getElementById('public-profile-name').textContent = "Carregando...";
    document.getElementById('public-profile-bio').textContent = "";
    document.getElementById('public-profile-avatar').src = "https://via.placeholder.com/120";
    
    const grid = document.getElementById('public-author-novels-grid');
    grid.innerHTML = '<p>Buscando obras...</p>';

    try {
        const userSnap = await getDoc(doc(db, "users", autorUID));
        if(userSnap.exists()) {
            const userData = userSnap.data();
            document.getElementById('public-profile-name').textContent = userData.username;
            document.getElementById('public-profile-bio').textContent = userData.bio || "Este autor ainda não escreveu uma biografia.";
            document.getElementById('public-profile-avatar').src = userData.avatarURL || "https://ui-avatars.com/api/?name=Autor";
        } else {
            document.getElementById('public-profile-name').textContent = "Autor Desconhecido";
            document.getElementById('public-profile-bio').textContent = "Sem informações disponíveis.";
        }

        const q = query(collection(db, "lightnovels"), where("autorUID", "==", autorUID));
        const novelSnap = await getDocs(q);
        
        grid.innerHTML = '';
        if(novelSnap.empty) {
            grid.innerHTML = '<p style="color:var(--text-muted)">Nenhuma obra publicada por este autor ainda.</p>';
            return;
        }

        novelSnap.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <img src="${data.capaURL}"> 
                <div class="card-info">
                    <h3>${data.titulo}</h3>
                    <p><i data-lucide="heart" style="width:12px; height:12px; display:inline-block;"></i> ${data.curtidas || 0}</p>
                </div>
            `;
            card.addEventListener('click', () => openNovel(doc.id));
            grid.appendChild(card);
        });
        lucide.createIcons();

    } catch(err) { console.error(err); grid.innerHTML = "Erro ao buscar informações."; }
}

// 7. Carregar Capítulos com Suporte a Volumes
async function loadChapters(novelId, isAuthor) {
    const list = document.getElementById('chapter-list');
    list.innerHTML = '<p>Carregando capítulos...</p>';
    
    try {
        const q = query(collection(db, `lightnovels/${novelId}/capitulos`), orderBy("numero"));
        const querySnapshot = await getDocs(q);
        
        list.innerHTML = '';
        let rawChapters = [];

        if(querySnapshot.empty) {
            list.innerHTML = '<p style="color:var(--text-muted)">Nenhum capítulo disponível ainda.</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            rawChapters.push({ id: doc.id, ...doc.data() });
        });

        const ultimoLido = localStorage.getItem(`ln_progress_${novelId}`);

        if (currentNovelData && currentNovelData.temVolumes) {
            rawChapters.sort((a, b) => {
                const volA = a.volume || 1;
                const volB = b.volume || 1;
                if (volA === volB) return a.numero - b.numero;
                return volA - volB;
            });
        }

        currentChaptersList = rawChapters; 
        let currentVolumeRendered = null;

        rawChapters.forEach((data) => {
            if (currentNovelData && currentNovelData.temVolumes) {
                const capVolume = data.volume || 1;
                if (capVolume !== currentVolumeRendered) {
                    currentVolumeRendered = capVolume;
                    const volHeader = document.createElement('h3');
                    volHeader.className = 'volume-header';
                    volHeader.textContent = `Volume ${capVolume}`;
                    list.appendChild(volHeader);
                }
            }

            const div = document.createElement('div');
            div.className = 'chapter-item';
            
            let htmlInner = `<div style="flex:1;"><strong>Capítulo ${data.numero}:</strong> ${data.titulo}</div>`;
            
            if(isAuthor) {
                htmlInner += `<button class="btn-danger delete-cap-btn" data-id="${data.id}"><i data-lucide="trash-2"></i></button>`;
            }

            div.innerHTML = htmlInner;
            if(ultimoLido === data.id) div.style.borderLeftColor = "var(--primary-color)";
            
            div.addEventListener('click', (e) => {
                if(!e.target.closest('.delete-cap-btn')) openReader(data.id, data);
            });

            list.appendChild(div);
        });

        if(isAuthor) {
            document.querySelectorAll('.delete-cap-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const capId = e.currentTarget.getAttribute('data-id');
                    if(confirm("Tem certeza que deseja apagar este capítulo? Esta ação é irreversível.")) {
                        try {
                            await deleteDoc(doc(db, `lightnovels/${novelId}/capitulos`, capId));
                            loadChapters(novelId, isAuthor);
                        } catch(err) { alert("Erro ao apagar: " + err.message); }
                    }
                });
            });
        }
        lucide.createIcons();

    } catch(e) { console.error(e); list.innerHTML='<p>Erro ao carregar capítulos</p>'; }
}

// FORMATADOR DE TEXTO DO CAPÍTULO (Negrito, Itálico, Citação)
function insertFormatTag(openTag, closeTag) {
    const textarea = document.getElementById('chapter-text');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    
    // Insere as tags no meio do texto selecionado
    textarea.value = text.substring(0, start) + openTag + text.substring(start, end) + closeTag + text.substring(end);
    
    // Reposiciona o cursor e o foco
    textarea.focus();
    textarea.selectionStart = start + openTag.length;
    textarea.selectionEnd = end + openTag.length;
}

document.getElementById('format-bold').addEventListener('click', () => insertFormatTag('<b>', '</b>'));
document.getElementById('format-italic').addEventListener('click', () => insertFormatTag('<i>', '</i>'));
document.getElementById('format-quote').addEventListener('click', () => insertFormatTag('<blockquote>', '</blockquote>'));


// 8. Upload de Capítulo
document.getElementById('form-upload-chapter').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    let capVolume = 1;
    if (currentNovelData && currentNovelData.temVolumes) {
        capVolume = Number(document.getElementById('chapter-volume').value) || 1;
    }

    const capData = {
        titulo: document.getElementById('chapter-title').value,
        numero: Number(document.getElementById('chapter-number').value),
        texto: document.getElementById('chapter-text').value,
        volume: capVolume,
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, `lightnovels/${currentNovelId}/capitulos`), capData);
        alert("Capítulo publicado!");
        e.target.reset();
        document.getElementById('chapter-volume').value = '1'; 
        openNovel(currentNovelId, false);
    } catch (e) { alert("Erro: " + e.message); }
});

// --- LEITOR (READER) ---
async function openReader(capId, capData = null, pushHistory = true) {
    currentChapterId = capId;
    navigateTo('reader', false);
    
    if (pushHistory) {
        history.pushState({ viewId: 'reader', capId: capId }, "", `/capitulo-${capId}`);
    }
    
    localStorage.setItem(`ln_progress_${currentNovelId}`, capId);

    // Salva no Histórico do Firebase (move para o começo da fila)
    if(currentUser && userProfile && currentNovelId) {
        let hist = userProfile.historico || [];
        hist = hist.filter(id => id !== currentNovelId); // remove se já existir
        hist.unshift(currentNovelId); // adiciona no começo
        if(hist.length > 50) hist.pop(); // limita a 50
        
        userProfile.historico = hist;
        updateDoc(doc(db, 'users', currentUser.uid), { historico: hist }).catch(console.error);
    }

    const content = document.getElementById('reader-content');
    content.style.fontSize = `${fontSize}px`;
    
    if (capData) {
        renderReaderData(capId, capData);
    } else {
        content.innerHTML = '<p style="text-align:center;">Carregando capítulo...</p>';
        if(!currentNovelId) currentNovelId = localStorage.getItem('last_viewed_novel') || "";
        
        getDoc(doc(db, `lightnovels/${currentNovelId}/capitulos`, capId)).then(docSnap => {
            if (docSnap.exists()) {
                renderReaderData(capId, docSnap.data());
            } else {
                content.innerHTML = '<p style="text-align:center;">Capítulo não encontrado.</p>';
            }
        }).catch(e => {
            content.innerHTML = '<p style="text-align:center;">Erro ao carregar capítulo.</p>';
        });
    }
}

function renderReaderData(capId, capData) {
    document.getElementById('reader-title').textContent = `Cap. ${capData.numero}`;
    const content = document.getElementById('reader-content');
    
    // Renderiza as formatações (b, i, blockquote) com segurança através das quebras de linha
    const formatText = capData.texto.split('\n').map(p => p.trim() ? `<p style="margin-bottom:20px;">${p}</p>` : '').join('');
    content.innerHTML = `<h2 style="margin-bottom: 30px; text-align:center;">${capData.titulo}</h2>${formatText}`;

    const currentIndex = currentChaptersList.findIndex(c => c.id === capId);
    const btnPrev = document.getElementById('btn-prev-chapter');
    const btnNext = document.getElementById('btn-next-chapter');

    if(currentIndex > 0) {
        btnPrev.disabled = false;
        btnPrev.onclick = () => openReader(currentChaptersList[currentIndex - 1].id, currentChaptersList[currentIndex - 1]);
    } else { btnPrev.disabled = true; btnPrev.onclick = null; }

    if(currentIndex !== -1 && currentIndex < currentChaptersList.length - 1) {
        btnNext.disabled = false;
        btnNext.onclick = () => openReader(currentChaptersList[currentIndex + 1].id, currentChaptersList[currentIndex + 1]);
    } else { btnNext.disabled = true; btnNext.onclick = null; }
}

document.getElementById('reader-back-btn').addEventListener('click', () => {
    if(currentNovelId) openNovel(currentNovelId);
    else navigateTo('home');
});

document.getElementById('btn-font-up').addEventListener('click', () => {
    fontSize += 2;
    document.getElementById('reader-content').style.fontSize = `${fontSize}px`;
    localStorage.setItem('ln_fontsize', fontSize);
});

document.getElementById('btn-font-down').addEventListener('click', () => {
    fontSize = Math.max(14, fontSize - 2);
    document.getElementById('reader-content').style.fontSize = `${fontSize}px`;
    localStorage.setItem('ln_fontsize', fontSize);
});

document.getElementById('btn-reader-mode').addEventListener('click', () => {
    const root = document.documentElement;
    const currentBg = getComputedStyle(root).getPropertyValue('--reader-bg').trim();
    if(currentBg === '#1e1e1e') {
        root.style.setProperty('--reader-bg', '#f4f4f4');
        root.style.setProperty('--reader-text', '#121212');
    } else {
        root.style.setProperty('--reader-bg', '#1e1e1e');
        root.style.setProperty('--reader-text', '#e0e0e0');
    }
});

handleInitialRoute();

// Configuração das doações
const donationData = {
    "2": {
        title: "Doar R$ 2,00 via PIX",
        img: "https://8upload.com/image/0a68da1adca6bb0e/2reais.jpg"
    },
    "5": {
        title: "Doar R$ 5,00 via PIX",
        img: "https://8upload.com/image/10875293a89161ef/5reais.jpg"
    },
    "10": {
        title: "Doar R$ 10,00 via PIX",
        img: "https://8upload.com/image/a03bf3216e3b4b7c/10reais.jpg"
    },
    "15": {
        title: "Doar R$ 15,00 via PIX",
        img: "https://8upload.com/image/ce49c02250410452/15reais.jpg"
    },
    "custom": {
        title: "Doação Livre via PIX",
        img: "https://8upload.com/image/0a68da1adca6bb0e/2reais.jpg" // Use um QR geral aqui se tiver
    }
};

// Lógica para trocar o QR Code ao clicar nos botões
document.querySelectorAll('.btn-donation').forEach(btn => {
    btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-val');
        const data = donationData[value];

        if (data) {
            // Atualiza o título e a imagem
            document.getElementById('donation-title').innerText = data.title;
            document.getElementById('donation-qr-img').src = data.img;

            // Gerencia a classe 'active' nos botões
            document.querySelectorAll('.btn-donation').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });
});

// Lógica para abrir/fechar o modal de doações
const donationModal = document.getElementById('doacoes-modal');

// Exemplo: Vincular a um botão do menu com data-link="doacoes"
function openDonationModal() {
    donationModal.classList.remove('hidden');
}

document.querySelector('.close-doacoes-modal').addEventListener('click', () => {
    donationModal.classList.add('hidden');
});
