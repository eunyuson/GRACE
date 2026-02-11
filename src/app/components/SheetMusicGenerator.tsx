import React, { useEffect, useRef, useState } from 'react';
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow';
import * as mm from '@magenta/music/es6';

export const SheetMusicGenerator: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);
    const [model, setModel] = useState<mm.OnsetsAndFrames | null>(null);
    const [status, setStatus] = useState('');

    useEffect(() => {
        // Initialize the model
        // Using a lighter checkpoint if available or the standard one
        const m = new mm.OnsetsAndFrames('https://storage.googleapis.com/magentadata/js/checkpoints/transcription/onsets_frames_uni');
        setModel(m);
    }, []);

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
                    {/* File Input Area */}
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
                            <p className="text-white font-bold mb-1">{file ? file.name : 'MP3 파일을 드래그하거나 클릭하여 업로드'}</p>
                            <p className="text-white/40 text-xs">AI가 음악을 듣고 악보를 그려줍니다</p>
                        </div>
                    </div>

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
