// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const JSONBIN_MASTER_KEY = process.env.JSONBIN_MASTER_KEY;
const JSONBIN_BIN_ID = process.env.JSONBIN_BIN_ID;
const JSONBIN_BASE = 'https://api.jsonbin.io/v3/b';

if (!JSONBIN_BIN_ID) {
  console.warn('⚠️ JSONBIN_BIN_ID não definido. Defina JSONBIN_BIN_ID em .env ou nas variáveis do host.');
}
if (!JSONBIN_MASTER_KEY) {
  console.warn('⚠️ JSONBIN_MASTER_KEY não definido. Defina JSONBIN_MASTER_KEY em .env ou nas variáveis do host.');
}

/*
  Endpoints expostos ao frontend:
  - GET  /api/bin        => retorna o conteúdo do bin (record)
  - PUT  /api/bin        => substitui o conteúdo do bin (espera JSON no body)
  - POST /api/bin/patch  => aplica um patch parcial (opcional) - aqui implementamos como PUT simples
*/

app.get('/api/bin', async (req, res) => {
  try {
    if(!JSONBIN_BIN_ID) return res.status(500).json({ error: 'BIN_ID não configurado' });
    const response = await fetch(`${JSONBIN_BASE}/${JSONBIN_BIN_ID}`, {
      headers: {
        'X-Master-Key': JSONBIN_MASTER_KEY
      }
    });
    if(!response.ok){
      const text = await response.text();
      return res.status(response.status).send({ error: text });
    }
    const payload = await response.json();
    // JSONBin v3 returns o conteúdo em payload.record
    return res.json({ ok: true, record: payload.record });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/bin', async (req, res) => {
  try {
    if(!JSONBIN_BIN_ID) return res.status(500).json({ error: 'BIN_ID não configurado' });
    const body = req.body;
    // validação simples
    if (!body) return res.status(400).json({ error: 'JSON inválido no body' });

    const response = await fetch(`${JSONBIN_BASE}/${JSONBIN_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY
      },
      body: JSON.stringify(body)
    });

    if(!response.ok){
      const text = await response.text();
      return res.status(response.status).send({ error: text });
    }

    const payload = await response.json();
    return res.json({ ok: true, result: payload });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
});
