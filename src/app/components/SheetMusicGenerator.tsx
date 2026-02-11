import React, { useEffect, useRef, useState } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow';
import * as mm from '@magenta/music/es6';

export const SheetMusicGenerator: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);
    const [model, setModel] = useState<mm.OnsetsAndFrames | null>(null);
    const [status, setStatus] = useState('');

    const [inputMode, setInputMode] = useState<'file' | 'youtube'>('file');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // Initialize the model
        // Using a lighter checkpoint if available or the standard one
        const m = new mm.OnsetsAndFrames('https://storage.googleapis.com/magentadata/js/checkpoints/transcription/onsets_frames_uni');
        setModel(m);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const getYoutubeId = (url: string) => {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const startRecording = async () => {
        try {
            // Request Tab Audio Sharing
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: "browser" } as any,
                audio: true,
                // @ts-ignore
                systemAudio: "include"
            });

            // Check if user shared audio
            if (stream.getAudioTracks().length === 0) {
                alert('오디오 공유가 선택되지 않았습니다. 다시 시도하고 "탭 오디오 공유"를 체크해주세요.');
                stream.getTracks().forEach(track => track.stop());
                return;
            }

            const recorder = new MediaRecorder(stream);
            const chunks: BlobPart[] = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const audioFile = new File([blob], "recording.webm", { type: 'audio/webm' });
                setFile(audioFile);
                setStatus('녹음이 완료되었습니다. 분석을 시작하세요.');
                stream.getTracks().forEach(track => track.stop()); // Stop sharing
            };

            recorder.start();
            setMediaRecorder(recorder);
            setIsRecording(true);
            setStatus('녹음 중... 영상을 재생하세요.');

            // Timer
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error(err);
            alert('녹음을 시작할 수 없습니다. 브라우저 권한을 확인해주세요.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setStatus('파일이 준비되었습니다.');
            // Clear output
            if (outputRef.current) outputRef.current.innerHTML = '';
        }
    };

    const processAudio = async () => {
        if (!file || !model || !outputRef.current) return;

        setIsProcessing(true);
        setStatus('AI 모델을 초기화하는 중...');

        try {
            if (!model.isInitialized()) {
                await model.initialize();
            }

            setStatus('오디오를 분석하고 있습니다... (10~30초 소요)');
            const ns = await model.transcribeFromAudioFile(file);

            setStatus('악보를 그리는 중...');
            renderVexFlow(ns);
            setStatus('완료!');
        } catch (error) {
            console.error(error);
            setStatus('오류가 발생했습니다: ' + (error as any).message);
            alert('오디오 처리 중 오류가 발생했습니다.');
        } finally {
            setIsProcessing(false);
        }
    };

    const renderVexFlow = (ns: mm.INoteSequence) => {
        // Clear previous
        if (outputRef.current) outputRef.current.innerHTML = '';

        const div = outputRef.current;
        if (!div) return;

        // Renderer setup
        const renderer = new Renderer(div, Renderer.Backends.SVG);
        renderer.resize(800, 250);
        const context = renderer.getContext();

        // Font setup (if needed explicitly, usually VexFlow handles defaults)
        context.setFont('Arial', 10);

        // Create a stave (staff)
        const stave = new Stave(10, 40, 700);
        stave.addClef('treble').addTimeSignature('4/4');
        stave.setContext(context).draw();

        // Process notes
        // 1. Sort by start time
        // 2. Filter out bad pitches
        // 3. Simple quantization: just take the first N notes and treat them as Quarter notes for demo
        const sortedNotes = ns.notes
            ? ns.notes
                .filter(n => n.pitch && n.pitch > 20 && n.pitch < 100) // Filter extreme ranges
                .sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
            : [];

        if (sortedNotes.length === 0) {
            setStatus('분석된 음표가 없습니다. 다른 오디오를 시도해보세요.');
            return;
        }

        // Limit to fit in one bar (or a few bars) for this simplified demo
        const demoNotes = sortedNotes.slice(0, 8); // Display first 8 notes

        const vexNotes = demoNotes.map(note => {
            const key = midiToKey(note.pitch || 60);
            // Default to quarter note 'q'
            return new StaveNote({ keys: [key], duration: "q" });
        });

        // Create a voice in 4/4
        // Calculate beats needed
        const numBeats = vexNotes.length;

        // VexFlow requires the voice to match the time signature roughly or we use SoftVoice?
        // Let's create a voice with exact beats we have for custom formatting
        const voice = new Voice({ numBeats: numBeats, beatValue: 4 });

        // Check if allow strict mode off
        voice.setStrict(false); // Validating time signature can be tricky with raw transcription
        voice.addTickables(vexNotes);

        // Format and adjust to stave width
        new Formatter().joinVoices([voice]).format([voice], 600);

        // Draw voice
        voice.draw(context, stave);
    };

    // Helper: Midi to VexFlow Key
    const midiToKey = (midi: number) => {
        const notes = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
        const octave = Math.floor(midi / 12) - 1;
        const noteIndex = midi % 12;
        return `${notes[noteIndex]}/${octave}`;
    };

    return (
        <div className="w-full h-full pt-32 md:pt-48 px-4 md:px-10 pb-10 flex flex-col items-center overflow-y-auto custom-scrollbar">
            <div className="w-full max-w-4xl flex flex-col items-center">
                <h1 className="text-3xl md:text-5xl font-['Anton'] text-white mb-2 tracking-wide">Sheet Music Lab</h1>
                <p className="text-white/40 mb-10 font-['Inter'] uppercase tracking-widest text-xs">AI 오디오 악보 변환 실험실</p>

                <div className="bg-white/5 border border-white/10 p-8 rounded-2xl w-full flex flex-col items-center gap-6 shadow-2xl backdrop-blur-sm">
                    {/* Input Mode Toggle */}
                    <div className="flex gap-2 p-1 bg-white/10 rounded-xl mb-6">
                        <button
                            onClick={() => setInputMode('file')}
                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${inputMode === 'file' ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
                        >
                            파일 업로드
                        </button>
                        <button
                            onClick={() => setInputMode('youtube')}
                            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${inputMode === 'youtube' ? 'bg-red-500 text-white shadow-lg' : 'text-white/50 hover:text-white'}`}
                        >
                            유튜브 / 녹음
                        </button>
                    </div>

                    {/* File Input Area */}
                    {inputMode === 'file' && (
                        <div className="w-full border-2 border-dashed border-white/20 rounded-xl p-10 flex flex-col items-center justify-center gap-4 transition-colors hover:border-emerald-500/50 hover:bg-white/5 group relative">
                            <input
                                type="file"
                                accept="audio/*"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div className="p-4 bg-emerald-500/20 text-emerald-300 rounded-full group-hover:scale-110 transition-transform">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                            </div>
                            <div className="text-center">
                                <p className="text-white font-bold mb-1">{file && !isRecording ? file.name : 'MP3 파일을 드래그하거나 클릭하여 업로드'}</p>
                                <p className="text-white/40 text-xs">AI가 음악을 듣고 악보를 그려줍니다</p>
                            </div>
                        </div>
                    )}

                    {/* YouTube/Recording Area */}
                    {inputMode === 'youtube' && (
                        <div className="w-full flex flex-col gap-4">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="유튜브 URL을 입력하세요 (예: https://youtu.be/...)"
                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-red-500/50"
                                    value={youtubeUrl}
                                    onChange={(e) => setYoutubeUrl(e.target.value)}
                                />
                            </div>

                            {/* Embed Player */}
                            {youtubeUrl && getYoutubeId(youtubeUrl) && (
                                <div className="w-full aspect-video bg-black rounded-xl overflow-hidden border border-white/10">
                                    <iframe
                                        width="100%"
                                        height="100%"
                                        src={`https://www.youtube.com/embed/${getYoutubeId(youtubeUrl)}`}
                                        title="YouTube video player"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    ></iframe>
                                </div>
                            )}

                            {/* Recorder Controls */}
                            <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col items-center gap-4">
                                <div className="text-center">
                                    <h3 className="text-white font-bold mb-2">PC 사운드 캡처</h3>
                                    <p className="text-white/40 text-xs mb-4">
                                        1. '녹음 시작'을 누르고 <strong className="text-emerald-400">현재 탭(또는 유튜브 탭)</strong>을 선택하고 <strong className="text-emerald-400">'오디오 공유'</strong>를 꼭 체크하세요.<br />
                                        2. 영상을 재생하면 오디오가 녹음됩니다. (권장: 10~20초)
                                    </p>
                                </div>

                                {!isRecording ? (
                                    <button
                                        onClick={startRecording}
                                        className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors shadow-lg shadow-red-900/20"
                                    >
                                        <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                                        녹음 시작 (Start Capture)
                                    </button>
                                ) : (
                                    <button
                                        onClick={stopRecording}
                                        className="flex items-center gap-2 px-6 py-3 bg-white text-red-500 hover:bg-gray-100 rounded-full font-bold transition-colors shadow-lg"
                                    >
                                        <div className="w-3 h-3 bg-red-500 rounded-sm" />
                                        녹음 중지 ({recordingTime}s)
                                    </button>
                                )}

                                {file && inputMode === 'youtube' && !isRecording && (
                                    <div className="text-emerald-400 text-xs font-bold mt-2">
                                        ✅ 오디오 캡처 완료! 아래 '악보 생성하기'를 눌러주세요.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Status Message */}
                    {status && (
                        <div className="text-emerald-400 font-mono text-sm animate-pulse">
                            &gt; {status}
                        </div>
                    )}

                    {/* Action Button */}
                    <button
                        onClick={processAudio}
                        disabled={!file || isProcessing}
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-lg ${!file || isProcessing
                            ? 'bg-white/10 text-white/30 cursor-not-allowed'
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/20'
                            }`}
                    >
                        {isProcessing ? 'AI가 열심히 분석 중입니다...' : '악보 생성하기'}
                    </button>

                    {/* Output Canvas */}
                    <div className="w-full bg-white rounded-xl p-4 min-h-[300px] flex items-center justify-center overflow-x-auto relative">
                        {!isProcessing && !outputRef.current?.innerHTML && (
                            <div className="text-center text-black/30">
                                <p className="mb-2">🎵</p>
                                <p className="text-sm">생성된 악보가 여기에 표시됩니다.</p>
                            </div>
                        )}
                        {isProcessing && (
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-black/50 text-xs animate-pulse">복잡한 음악은 분석에 시간이 더 걸릴 수 있습니다</p>
                            </div>
                        )}
                        <div id="output" ref={outputRef} className="bg-white"></div>
                    </div>

                    <div className="w-full bg-black/20 rounded-lg p-4 border border-white/5">
                        <h4 className="text-white/60 text-xs font-bold uppercase mb-2">💡 참고사항</h4>
                        <ul className="text-white/40 text-xs space-y-1 list-disc list-inside">
                            <li>현재는 <strong>실험 기능(Beta)</strong>으로, AI가 인식한 첫 8개의 음표만 표시됩니다.</li>
                            <li>정확한 박자 분석은 아직 지원되지 않으며, 모든 음표는 4분음표로 표시됩니다.</li>
                            <li>브라우저 성능에 따라 분석 속도가 달라질 수 있습니다.</li>
                            <li>피아노 소리가 명확한 오디오 파일에서 가장 잘 작동합니다.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};
