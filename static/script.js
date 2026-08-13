// Estado global
let currentMusic = null;
let audioPlayer = null;
let isPlaying = false;
let currentView = 'library';
let downloadIntervals = {};

// DOM Elements
const views = {
    library: document.getElementById('view-library'),
    search: document.getElementById('view-search'),
    downloads: document.getElementById('view-downloads')
};

const navItems = document.querySelectorAll('.nav-item');
const libraryList = document.getElementById('library-list');
const searchResults = document.getElementById('search-results');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const playPauseBtn = document.getElementById('play-pause-btn');
const progressBar = document.getElementById('progress-bar');
const timeDisplay = document.getElementById('time-display');
const volumeControl = document.getElementById('volume-control');
const nowPlayingName = document.querySelector('.track-name');
const nowPlayingArtist = document.querySelector('.track-artist');
const downloadsList = document.getElementById('downloads-list');

// Navegação
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        switchView(view);
    });
});

function switchView(view) {
    currentView = view;
    
    // Atualiza navegação
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });
    
    // Mostra view correta
    Object.keys(views).forEach(key => {
        views[key].classList.toggle('active', key === view);
    });
    
    // Carrega dados se necessário
    if (view === 'library') loadLibrary();
    if (view === 'downloads') updateDownloadsList();
}

// Buscar músicas
searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    
    searchResults.innerHTML = '<div class="loading">🔍 Buscando...</div>';
    
    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        
        const data = await response.json();
        
        if (data.error) {
            searchResults.innerHTML = `<div class="error">❌ ${data.error}</div>`;
            return;
        }
        
        renderSearchResults(data.results);
    } catch (error) {
        searchResults.innerHTML = `<div class="error">❌ Erro ao buscar: ${error.message}</div>`;
    }
}

function renderSearchResults(results) {
    if (!results || results.length === 0) {
        searchResults.innerHTML = '<div class="info">Nenhum resultado encontrado.</div>';
        return;
    }
    
    searchResults.innerHTML = results.map(video => `
        <div class="music-card" data-video-id="${video.id}">
            <img src="${video.thumbnail}" alt="${video.title}" />
            <div class="title">${video.title}</div>
            <div class="artist">${video.channel}</div>
            <div class="duration">${formatDuration(video.duration)}</div>
            <div class="actions">
                <button onclick="downloadMusic('${video.id}', '${escapeHtml(video.title)}', '${escapeHtml(video.channel)}')" title="Baixar">
                    ⬇️
                </button>
            </div>
        </div>
    `).join('');
}

// Download de música
async function downloadMusic(videoId, title, channel) {
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_id: videoId, title, channel })
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert(`Erro: ${data.error}`);
            return;
        }
        
        // Adiciona à lista de downloads
        const downloadItem = document.createElement('div');
        downloadItem.className = 'download-item';
        downloadItem.id = `download-${data.download_id}`;
        downloadItem.innerHTML = `
            <strong>${title}</strong>
            <div class="download-progress">
                <div class="download-progress-bar" style="width: 0%"></div>
            </div>
            <small>Status: Iniciando...</small>
        `;
        downloadsList.prepend(downloadItem);
        
        // Inicia monitoramento
        monitorDownload(data.download_id, title);
        
        // Muda para view de downloads
        switchView('downloads');
        
    } catch (error) {
        alert(`Erro no download: ${error.message}`);
    }
}

function monitorDownload(downloadId, title) {
    const interval = setInterval(async () => {
        try {
            const response = await fetch(`/api/download/status/${downloadId}`);
            const data = await response.json();
            
            const item = document.getElementById(`download-${downloadId}`);
            if (!item) return;
            
            const progressBar = item.querySelector('.download-progress-bar');
            const statusText = item.querySelector('small');
            
            if (data.status === 'concluido') {
                progressBar.style.width = '100%';
                statusText.textContent = '✅ Concluído!';
                clearInterval(interval);
                loadLibrary();
                
                setTimeout(() => {
                    item.style.opacity = '0.5';
                    setTimeout(() => {
                        item.remove();
                    }, 1000);
                }, 2000);
                
            } else if (data.status === 'erro') {
                progressBar.style.width = '100%';
                progressBar.style.background = '#e74c3c';
                statusText.textContent = `❌ Erro: ${data.error || 'Falha no download'}`;
                clearInterval(interval);
                
            } else {
                progressBar.style.width = `${data.progress || 0}%`;
                const statusMap = {
                    'iniciando': '🔄 Iniciando...',
                    'baixando': '⬇️ Baixando...'
                };
                statusText.textContent = statusMap[data.status] || data.status;
            }
            
        } catch (error) {
            console.error('Erro ao monitorar download:', error);
        }
    }, 1000);
    
    downloadIntervals[downloadId] = interval;
}

// Biblioteca
async function loadLibrary() {
    try {
        const response = await fetch('/api/library');
        const data = await response.json();
        
        renderLibrary(data.library);
    } catch (error) {
        console.error('Erro ao carregar biblioteca:', error);
        libraryList.innerHTML = '<div class="error">❌ Erro ao carregar biblioteca</div>';
    }
}

function renderLibrary(musics) {
    if (!musics || musics.length === 0) {
        libraryList.innerHTML = `
            <div class="info">
                🎵 Sua biblioteca está vazia. 
                <br>Busque e baixe suas músicas favoritas!
            </div>
        `;
        return;
    }
    
    libraryList.innerHTML = musics.map(music => `
        <div class="music-card" data-id="${music.id}">
            <img src="${music.thumbnail || 'https://via.placeholder.com/200x200/1DB954/fff?text=🎵'}" alt="${music.title}" />
            <div class="title">${music.title}</div>
            <div class="artist">${music.channel || 'Artista'}</div>
            <div class="duration">${formatDuration(music.duration)}</div>
            <div class="actions">
                <button onclick="playMusic(${music.id})" title="Tocar">
                    ▶️
                </button>
                <button onclick="deleteMusic(${music.id})" title="Remover">
                    🗑️
                </button>
            </div>
        </div>
    `).join('');
}

// Player
async function playMusic(musicId) {
    try {
        const response = await fetch(`/api/play/${musicId}`);
        
        if (!response.ok) {
            const error = await response.json();
            alert(`Erro: ${error.error || 'Não foi possível tocar a música'}`);
            return;
        }
        
        // Carrega a música no player
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (audioPlayer) {
            audioPlayer.pause();
            URL.revokeObjectURL(audioPlayer.src);
        }
        
        audioPlayer = new Audio(url);
        audioPlayer.volume = volumeControl.value / 100;
        
        // Busca informações da música
        const libraryResponse = await fetch('/api/library');
        const libraryData = await libraryResponse.json();
        const music = libraryData.library.find(m => m.id === musicId);
        
        if (music) {
            nowPlayingName.textContent = music.title;
            nowPlayingArtist.textContent = music.channel || 'Artista';
            currentMusic = music;
        }
        
        audioPlayer.addEventListener('timeupdate', updateProgress);
        audioPlayer.addEventListener('ended', () => {
            isPlaying = false;
            playPauseBtn.textContent = '▶️';
        });
        
        audioPlayer.play();
        isPlaying = true;
        playPauseBtn.textContent = '⏸️';
        
    } catch (error) {
        alert(`Erro ao tocar música: ${error.message}`);
    }
}

// Controles do Player
playPauseBtn.addEventListener('click', () => {
    if (!audioPlayer) return;
    
    if (isPlaying) {
        audioPlayer.pause();
        playPauseBtn.textContent = '▶️';
    } else {
        audioPlayer.play();
        playPauseBtn.textContent = '⏸️';
    }
    isPlaying = !isPlaying;
});

progressBar.addEventListener('input', (e) => {
    if (!audioPlayer) return;
    const seekTime = (e.target.value / 100) * audioPlayer.duration;
    audioPlayer.currentTime = seekTime;
});

volumeControl.addEventListener('input', (e) => {
    if (audioPlayer) {
        audioPlayer.volume = e.target.value / 100;
    }
});

function updateProgress() {
    if (!audioPlayer) return;
    const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
    progressBar.value = percent || 0;
    
    timeDisplay.textContent = `${formatTime(audioPlayer.currentTime)} / ${formatTime(audioPlayer.duration)}`;
}

// Gerenciar Downloads
function updateDownloadsList() {
    // Atualiza lista de downloads ativos
    const items = downloadsList.querySelectorAll('.download-item');
    if (items.length === 0) {
        downloadsList.innerHTML = '<div class="info">Nenhum download em andamento.</div>';
    }
}

// Deletar música
async function deleteMusic(musicId) {
    if (!confirm('Tem certeza que deseja remover esta música da biblioteca?')) return;
    
    try {
        const response = await fetch(`/api/library/${musicId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.error) {
            alert(`Erro: ${data.error}`);
            return;
        }
        
        loadLibrary();
        if (currentMusic && currentMusic.id === musicId) {
            if (audioPlayer) {
                audioPlayer.pause();
                audioPlayer = null;
            }
            nowPlayingName.textContent = 'Nenhuma música tocando';
            nowPlayingArtist.textContent = '-';
            playPauseBtn.textContent = '▶️';
            isPlaying = false;
        }
        
    } catch (error) {
        alert(`Erro ao remover música: ${error.message}`);
    }
}

// Utilitários
function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(time) {
    if (!time || isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Inicialização
loadLibrary();
