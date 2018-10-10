'use strict';

const functions = require('firebase-functions');
const {WebhookClient, Suggestion, Card} = require('dialogflow-fulfillment');

process.env.DEBUG = 'dialogflow:debug';

const context = {
    wrong: {
        sound: '<audio src="https://actions.google.com/sounds/v1/cartoon/cartoon_boing.ogg">No, errore!</audio>',
        text: [
            'Risposta sbagliata: riprova!',
            'No, risposta sbagliata: riprova!',
            'Eh no, risposta sbagliata: riprova!',
            'Peccato, risposta sbagliata: riprova!',
            'Uffi, risposta errata: riprova!',
            'Conta meglio, risposta sbagliata!',
        ]
    },
    right: {
        sound: '<audio src="https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg">Bravo!</audio>',
        text: [
            'Hai indovinato!',
            'Ottimo! Hai indovinato!',
            'Bravo! Hai indovinato!',
            'Eccellente! Hai indovinato!',
            'Molto bene! Hai indovinato!',
            'Yes! Hai indovinato!',
            'Perfetto! Hai indovinato!',
            'Bravissimo! Hai indovinato!',
            'Fantastico! Hai indovinato',
            'Meraviglioso! Hai indovinato!',
        ]
    },
    misunderstand: {
        sound: undefined,
        text: [
            'Non ho capito.',
            'Puoi ripetere?',
            'Cosa hai detto?',
            'Scusami, puoi ripetere?',
            `Sono un po' sordo: puoi ripetere?`,
            'Non si sente bene: puoi ripetere?',
        ]
    },
    credits: {
        sound: undefined,
        text: [
            'Grazie per aver giocato; alla prossima!',
            `È stato un piacere giocare con te!`,
            'Spero di rivederti presto!',
            'Spero di rivederti, anzi risentirti presto!',
            'Ciao e... duc in altum!',
            'Buona continuazione amico mio.',
        ]
    }
};

const i18n = {
    context: context,
    get: function(type) {
        var thereIsSound = this.context[type].sound;
        var sizeOfText = this.context[type].text.length;
        var index = getRandomNumber(0, sizeOfText-1);
        var outputText = '';
        if (thereIsSound) outputText += this.context[type].sound.toString() + ' ';
        outputText += this.context[type].text[index];
        return outputText;
    },
    wrap: function(content) {
        return (content.search(/<audio /) != -1) ?
            '<speak>' + content + '</speak>' :
            content;
    }
};

const getRandomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    console.log('le-addizioni [v1.7.37]');
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    const agent = new WebhookClient({ request, response });
    const levels = ['base', 'elementare', 'medio', 'superiore'];

    function welcome(agent) {
        console.log('[welcome]');
        let welcomeText = 'Benvenuto! Seleziona il livello desiderato tra: ';
        levels.forEach((level) => {
            welcomeText += level + ', ';
            agent.add(new Suggestion(level));
        });
        const card = new Card({
            title: 'Il gioco delle addizioni',
            text: 'Metti alla prova le tue abilità di matematica!',
            imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
        });
        agent.add(card);
        agent.add(welcomeText);
    }

    function setDifficultyLevel(agent) {
        const level = agent.parameters.difficultyLevel;
        console.log('[difficultyLevel]');
        console.log('Livello scelto: ' + level);
        const addends = pickNumbers(level);

        agent.add("Quanto fa " + addends[0] + " più " + addends[1] + "?");

        setData(agent, {
            level: level,
            correctGuesses: 0,
            totalGuesses: 0,
            firstAddend: addends[0],
            secondAddend: addends[1],
            firstAttempt: true,
            misundestand: false
        });
    }

    function pickNumbers(level) {
        console.log('[pickNumbers]');
        console.log(level);
        let firstAddend, secondAddend, multiplier;
        switch(level) {
            case 'base':
                multiplier = 10;
                break;
            case 'elementare':
                multiplier = 100;
                break;
            case 'medio':
                multiplier = 1000;
                break;
            case 'superiore':
                multiplier = 10000;
                break;
        }
        firstAddend = getRandomNumber(0, multiplier);
        secondAddend = getRandomNumber(0, (multiplier - firstAddend));

        return [firstAddend, secondAddend];
    }

    function responseAnswer(agent) {
        console.log('[responseAnswer]');
        let data = getData(agent);
        console.log(data);
        const guessedNumber = agent.parameters.guessedNumber;
        const correctAnswer = data.firstAddend + data.secondAddend;
        var agentResponse = '';

        if (guessedNumber === correctAnswer) {
            agentResponse = i18n.get('right');
            data.totalGuesses++;
            data.correctGuesses++;
            data.firstAttempt = true;
        } else {
            if (data.firstAttempt) {
                agentResponse = i18n.get('wrong');
                agentResponse += ' Quanto fa ' + data.firstAddend + ' più ' + data.secondAddend + '?';
                data.firstAttempt = false;
            } else {
                agentResponse += ' <audio src="https://actions.google.com/sounds/v1/cartoon/metal_twang.ogg">No, errore!</audio>';
                agentResponse += ' No, mi dispiace: ' + data.firstAddend + ' più ' + data.secondAddend + ' fa ' + correctAnswer + '.';
                data.firstAttempt = true;
                data.totalGuesses++;
            }
        }

        if (data.firstAttempt) {
            const addends = pickNumbers(data.level);
            data.firstAddend = addends[0];
            data.secondAddend = addends[1];
            agentResponse += ' Quanto fa ' + addends[0] + ' più ' + addends[1] + '?';
        }

        setData(agent, data);
        agent.add(i18n.wrap(agentResponse));
    }
    
    function misunderstand(agent) {
        console.log('[misunderstand]');
        let data = getData(agent);
        if (typeof data === 'undefined') {
            agent.add(i18n.get('misunderstand'));
        } else if (data.misunderstand) {
            fallback(agent);
        } else {
            agent.add(i18n.get('misunderstand'));
            data.misunderstand = true;
            setData(agent, data);
        }
    }
    
    function fallback(agent) {
        console.log('[fallback]');
        let data = getData(agent);
        console.log(data);
        let agentResponse = '';
        let pluralQuestion = 'domande';
        if (data.correctGuesses == 1) {
            pluralQuestion = 'domanda';
            data.correctGuesses = 'una';
        }
        if (data.totalGuesses == 1) {
            data.totalGuesses = 'una';
        }
        agentResponse += ' Hai risposto correttamente a ' + data.correctGuesses + ' ' + pluralQuestion + ' su ' + data.totalGuesses + '.';
        agentResponse += i18n.get('credits');
        agentResponse += ' <audio src="https://actions.google.com/sounds/v1/transportation/wet_tire_drive_by.ogg">Voli via!</audio>';
        let conv = agent.conv();
        conv.close(i18n.wrap(agentResponse));
        agent.add(conv);
    }

    function getData(agent) {
        const data = agent.getContext('data');
        return (data !== null) ? 
            data.parameters :
            undefined;
    }

    function setData(agent, data) {
        agent.setContext({
            name: 'data',
            lifespan: 1,
            parameters: data
        });
    }

    let intentMap = new Map();
    intentMap.set('Welcome and Level Choice', welcome);
    intentMap.set('Difficulty Level', setDifficultyLevel);
    intentMap.set('Response Answer', responseAnswer);
    intentMap.set('Misundestand', misunderstand);
    intentMap.set('End of game', fallback);

    agent.handleRequest(intentMap);
});
