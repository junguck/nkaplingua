FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
 && pip install --no-cache-dir -r requirements.txt
COPY nkap_tts ./nkap_tts
ENV TTS_CACHE=/data/tts HF_HOME=/data/hf
EXPOSE 8800
CMD ["uvicorn", "nkap_tts.app:build", "--factory", "--host", "0.0.0.0", "--port", "8800"]
