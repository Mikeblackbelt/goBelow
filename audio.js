export const audios = [
    "audio/jojo's-bizarre-adventure-cmoon-made-with-Voicemod.mp3",
    'audio/1167962_Into-the-Hurricane.mp3',
    '/audio/burrow.mp3',
   '/audio/za-warudo-toki-wo-tomare-1.mp3',
   '/audio/killer-queen.mp3'

];

export let audioElements = [];

export function setUpAudio() {
    document.addEventListener('click', () => {
        audios.forEach((audioLink) => {
            let audio = new Audio(audioLink);
            audio.load();
            audioElements.push(audio);
        });
    });
}

export function playAudio(idx, loop=false, playBackSpeed = 1) {
    if (audioElements[idx]) {
        audioElements[idx].play();
        audioElements[idx].loop = loop;
        audioElements[idx].playbackRate = playBackSpeed
    }
}

// call setup somewhere
setUpAudio();