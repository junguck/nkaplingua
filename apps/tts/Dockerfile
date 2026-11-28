# Service voix : transcodage mp3 (ffmpeg statique) et synthèse PyTorch MMS-VITS (TORCH=1).
FROM python:3.12-slim
ARG TORCH=1
# Certificats supplémentaires facultatifs (proxy d'entreprise au moment du build). Vide par défaut.
COPY certs/ /tmp/certs/
RUN if ls /tmp/certs/*.crt >/dev/null 2>&1; then cat /tmp/certs/*.crt >> /etc/ssl/certs/ca-certificates.crt; fi
ENV PIP_CERT=/etc/ssl/certs/ca-certificates.crt
WORKDIR /app
RUN pip install --no-cache-dir fastapi==0.115.12 uvicorn==0.34.3 numpy pymongo==4.13.2 redis==6.2.0 imageio-ffmpeg==0.6.0 \
 && if [ "$TORCH" = "1" ]; then pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch && pip install --no-cache-dir "transformers>=4.44"; fi
COPY nkap_tts ./nkap_tts
RUN useradd --create-home app && mkdir -p /data && chown app /data
USER app
ENV TTS_CACHE=/data/tts HF_HOME=/data/hf
EXPOSE 8800
HEALTHCHECK --interval=10s --timeout=3s --retries=6 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8800/health', timeout=2)"
CMD ["uvicorn", "nkap_tts.app:build", "--factory", "--host", "0.0.0.0", "--port", "8800"]
