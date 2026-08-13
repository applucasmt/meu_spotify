from flask import Flask, render_template, request, jsonify, send_file
from pytube import YouTube
import os
import json
import threading
import time
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'sua-chave-secreta-aqui'

# Pasta para armazenar músicas baixadas
DOWNLOAD_FOLDER = 'downloads'
if not os.path.exists(DOWNLOAD_FOLDER):
    os.makedirs(DOWNLOAD_FOLDER)

# Arquivo para salvar biblioteca de músicas
LIBRARY_FILE = 'library.json'

# Biblioteca de músicas (simulando um banco de dados)
library = []
downloads_in_progress = {}

def load_library():
    global library
    if os.path.exists(LIBRARY_FILE):
        try:
            with open(LIBRARY_FILE, 'r', encoding='utf-8') as f:
                library = json.load(f)
        except:
            library = []
    else:
        library = []

def save_library():
    with open(LIBRARY_FILE, 'w', encoding='utf-8') as f:
        json.dump(library, f, ensure_ascii=False, indent=2)

load_library()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/search', methods=['POST'])
def search_youtube():
    """Busca músicas no YouTube"""
    query = request.json.get('query', '')
    if not query:
        return jsonify({'error': 'Query vazia'}), 400
    
    try:
        # Busca no YouTube
        from pytube import Search
        search = Search(query)
        results = []
        
        # Limita a 20 resultados
        for video in search.results[:20]:
            results.append({
                'id': video.video_id,
                'title': video.title,
                'duration': video.length,
                'thumbnail': video.thumbnail_url,
                'channel': video.author,
                'url': f"https://www.youtube.com/watch?v={video.video_id}"
            })
        
        return jsonify({'results': results})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def download_music():
    """Download de música do YouTube"""
    video_id = request.json.get('video_id')
    title = request.json.get('title', 'musica')
    channel = request.json.get('channel', 'desconhecido')
    
    if not video_id:
        return jsonify({'error': 'ID do vídeo não fornecido'}), 400
    
    # Verifica se já está na biblioteca
    for music in library:
        if music['video_id'] == video_id:
            return jsonify({'error': 'Música já está na biblioteca'}), 400
    
    # Cria um ID único para o download
    download_id = f"download_{datetime.now().timestamp()}"
    downloads_in_progress[download_id] = {
        'status': 'iniciando',
        'progress': 0,
        'video_id': video_id,
        'title': title
    }
    
    # Inicia download em thread separada
    def download_thread():
        try:
            downloads_in_progress[download_id]['status'] = 'baixando'
            downloads_in_progress[download_id]['progress'] = 10
            
            # Cria objeto YouTube
            yt = YouTube(f"https://www.youtube.com/watch?v={video_id}")
            
            # Pega o melhor áudio
            audio_stream = yt.streams.filter(only_audio=True).first()
            
            downloads_in_progress[download_id]['progress'] = 30
            
            # Define nome do arquivo
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()
            filename = f"{safe_title}_{video_id}.mp4"
            filepath = os.path.join(DOWNLOAD_FOLDER, filename)
            
            downloads_in_progress[download_id]['progress'] = 50
            
            # Baixa o arquivo
            audio_stream.download(filename=filename, output_path=DOWNLOAD_FOLDER)
            
            downloads_in_progress[download_id]['progress'] = 90
            
            # Adiciona à biblioteca
            music_data = {
                'id': len(library) + 1,
                'title': title,
                'video_id': video_id,
                'channel': channel,
                'filename': filename,
                'filepath': filepath,
                'duration': yt.length,
                'thumbnail': yt.thumbnail_url,
                'added_at': datetime.now().isoformat()
            }
            
            library.append(music_data)
            save_library()
            
            downloads_in_progress[download_id]['status'] = 'concluido'
            downloads_in_progress[download_id]['progress'] = 100
            
        except Exception as e:
            downloads_in_progress[download_id]['status'] = 'erro'
            downloads_in_progress[download_id]['error'] = str(e)
    
    thread = threading.Thread(target=download_thread)
    thread.start()
    
    return jsonify({
        'download_id': download_id,
        'message': 'Download iniciado'
    })

@app.route('/api/download/status/<download_id>')
def download_status(download_id):
    """Verifica o status do download"""
    status = downloads_in_progress.get(download_id)
    if not status:
        return jsonify({'error': 'Download não encontrado'}), 404
    
    return jsonify(status)

@app.route('/api/library')
def get_library():
    """Retorna a biblioteca de músicas"""
    return jsonify({'library': library})

@app.route('/api/library/<int:music_id>', methods=['DELETE'])
def delete_music(music_id):
    """Remove uma música da biblioteca"""
    global library
    
    music_to_delete = None
    for music in library:
        if music['id'] == music_id:
            music_to_delete = music
            break
    
    if not music_to_delete:
        return jsonify({'error': 'Música não encontrada'}), 404
    
    # Remove o arquivo físico
    try:
        if os.path.exists(music_to_delete['filepath']):
            os.remove(music_to_delete['filepath'])
    except:
        pass
    
    # Remove da biblioteca
    library = [m for m in library if m['id'] != music_id]
    save_library()
    
    return jsonify({'message': 'Música removida com sucesso'})

@app.route('/api/play/<int:music_id>')
def play_music(music_id):
    """Reproduz uma música da biblioteca"""
    music = None
    for m in library:
        if m['id'] == music_id:
            music = m
            break
    
    if not music:
        return jsonify({'error': 'Música não encontrada'}), 404
    
    if not os.path.exists(music['filepath']):
        return jsonify({'error': 'Arquivo não encontrado'}), 404
    
    return send_file(music['filepath'], as_attachment=False)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
