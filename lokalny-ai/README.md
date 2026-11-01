# Lokalny AI — czat z lokalnymi modelami na iPhone

PWA: modele LLM liczone na GPU iPhone'a przez WebGPU (silnik WebLLM 0.2.87). Po pobraniu wag działa offline, a rozmowy zostają na telefonie.

## Wymagania
- iOS / iPadOS **26+** (Safari ma tam WebGPU włączone domyślnie)
- iPhone z 6 GB+ RAM dla modeli 2 GB+ (15 Pro / 16 / 17). Modele 1B działają też na starszych.
- Hosting po **HTTPS** (WebGPU i service worker nie działają po http ani z file://)

## Deploy (bez Maca)

**GitHub Pages** (najprościej):
```bash
cd lokalny-ai
git init && git add . && git commit -m "lokalny ai"
gh repo create lokalny-ai --public --source . --push
gh api repos/{owner}/lokalny-ai/pages -X POST -f "source[branch]=main" -f "source[path]=/"
```
Adres: `https://<login>.github.io/lokalny-ai/`

Alternatywy: Cloudflare Pages / Netlify (przeciągnij folder) albo własny serwer za Caddy/nginx z certyfikatem.

## Instalacja na iPhonie
1. Otwórz adres w **Safari**.
2. Udostępnij → **Do ekranu początkowego**.
3. Uruchom z ikony, ⚙︎ → wybierz model → **Załaduj model** (najlepiej na Wi-Fi).

## Modele
| Model | Rozmiar | Uwagi |
|---|---|---|
| SmolLM2 360M | 0.4 GB | test / najsłabsze telefony |
| Gemma 3 1B | 0.7 GB | domyślny, przyzwoity polski |
| Llama 3.2 1B | 0.9 GB | szybki |
| Qwen3 1.7B | 2.0 GB | tryb myślenia (przełącznik) |
| Llama 3.2 3B | 2.3 GB | najlepsza jakość |
| Qwen2.5 Coder 1.5B | 1.6 GB | kod |
| Hermes 3 3B | 2.3 GB | bez cenzury: oficjalny build mlc-ai, rzadko odmawia |
| Llama 3.2 3B abliterated | 2.3 GB | bez cenzury: usunięte odmowy, repo społeczności (eksperymentalny) |

Kolejne modele dopisujesz do tablicy `MODELS` w `app.js` — ID z `prebuiltAppConfig` WebLLM.

### Własny model (np. inny abliterated)
Konwersja działa na Linux/WSL, Mac nie jest potrzebny:
```bash
pip install --pre -U -f https://mlc.ai/wheels mlc-llm-nightly-cpu mlc-ai-nightly-cpu huggingface_hub
huggingface-cli download <autor>/<Llama-3.2-3B-...-abliterated> --local-dir src
mlc_llm convert_weight src --quantization q4f16_1 -o out
mlc_llm gen_config     src --quantization q4f16_1 --conv-template llama-3_1 -o out
huggingface-cli upload <twój-login>/<nazwa>-q4f16_1-MLC out
```
Potem dopisz do `MODELS` wpis z polami `model` (URL repo) i `lib`. `lib` to wasm z tej samej architektury i tego samego rozmiaru, np. dla Llama 3.2 3B ten sam, którego używa wpis „abliterated”. Dla Qwen3 bierzesz `--conv-template qwen2` i wasm Qwen3 o tym samym rozmiarze z `prebuiltAppConfig`.

Jeśli repo społeczności nie chce się załadować, to najpewniej zostało skonwertowane starszym MLC i ma `ndarray-cache.json` zamiast `tensor-cache.json`. Wtedy skonwertuj model sam według kroków wyżej.

## Pliki
- `index.html` — UI + style
- `app.js` — silnik, streaming, historia (localStorage), ustawienia
- `sw.js` — offline dla aplikacji i biblioteki (wagi cache'uje WebLLM)
- `manifest.webmanifest`, `icon-*.png` — instalacja PWA

## Znane ograniczenia
- iOS może ubić kartę przy modelu za dużym na RAM — wtedy wybierz mniejszy.
- Kontekst 4k tokenów; aplikacja wysyła ostatnie 16 wiadomości.
- Przy zmianie `app.js`/`index.html` podbij `CACHE` w `sw.js`, jeśli chcesz wymusić odświeżenie offline.

## Wersja natywna (opcjonalnie, wymaga Maca)
Swift + MLX Swift (`mlx-swift-examples`, target LLMEval) albo llama.cpp (`llama.swiftui`). Jest szybsza i ma dostęp do większej ilości RAM, ale do builda i podpisu potrzebny jest Xcode.
