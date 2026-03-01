export const audios = [
    "audio/jojo's-bizarre-adventure-cmoon-made-with-Voicemod.mp3",
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

export function playAudio(idx) {
    if (audioElements[idx]) {
        audioElements[idx].play();
    }
}

// call setup somewhere
setUpAudio();