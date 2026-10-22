FROM alpine:3.22

RUN apk add --no-cache python3 py3-pip py3-pillow tzdata font-dejavu \
    && pip3 install --no-cache-dir --break-system-packages \
       "flask>=3.0" "waitress>=3.0" "paho-mqtt>=2.0" "requests>=2.31" "fpdf2>=2.7"

COPY app /app
WORKDIR /app

CMD ["python3", "-u", "/app/app.py"]
