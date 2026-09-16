const express = require('express');

module.exports = function createCategoryRouter(db) {
  const router = express.Router();
  const model = 'qwen3:1.7b';
  const categories = ['Konkursy i akcje','Promocje i zniżki','Produkty','Procedury i zmiany','Systemy','Szkolenia','Pozostałe'];

  router.post('/analyze/:id', async (req, res) => {
    const item = db.prepare('SELECT x.id, x.title, m.body_text FROM items x JOIN messages m ON m.id=x.message_id WHERE x.id=?').get(req.params.id);
    if (!item) return res.status(404).json({error:'Nie znaleziono wiadomości'});

    const source = String(item.body_text || '');
    const text = source.slice(0, 6000);
    const instructions = [
      'Przypisz wiadomość do dokładnie jednej kategorii.',
      'Konkursy i akcje = konkursy, akcje sprzedażowe, rankingi i nagrody dla pośredników.',
      'Promocje i zniżki = rabaty, zniżki i promocje cenowe lub ofertowe dla klientów.',
      'Produkty = informacje o produktach, zakresie ubezpieczenia, OWU i taryfach.',
      'Procedury i zmiany = instrukcje, procesy, wymogi oraz zmiany organizacyjne i operacyjne.',
      'Systemy = awarie, niedostępność, dostęp i logowanie, prace techniczne oraz działanie systemów i aplikacji.',
      'Szkolenia = szkolenia, webinary, warsztaty i spotkania edukacyjne.',
      'Pozostałe = tylko gdy żadna z powyższych nie pasuje.',
      'Nie analizuj dat, ważności ani pewności. Nie streszczaj.',
      'Zwróć wyłącznie JSON z polem category.'
    ].join('\n');
    const prompt = instructions + '\n\nTemat: ' + item.title + '\nTreść:\n' + text;
    const schema = {type:'object',properties:{category:{type:'string',enum:categories}},required:['category'],additionalProperties:false};
    const started = Date.now();

    try {
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify({model,prompt,stream:false,think:false,format:schema,options:{temperature:0,num_predict:32}}),
        signal:AbortSignal.timeout(180000)
      });
      if (!response.ok) throw Error('Ollama HTTP ' + response.status);
      const data = await response.json();
      let result;
      try { result = JSON.parse(data.response); } catch { throw Error('Model nie zwrócił poprawnego JSON'); }
      if (!categories.includes(result.category)) throw Error('Model zwrócił nieprawidłową kategorię');
      res.json({ok:true,mode:'category-only',model,elapsed_ms:Date.now()-started,input_chars:text.length,source_chars:source.length,result:{category:result.category}});
    } catch (e) {
      res.status(500).json({error:e.message,input_chars:text.length,source_chars:source.length});
    }
  });

  return router;
};
