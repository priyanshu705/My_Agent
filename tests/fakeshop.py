import json, threading
from http.server import BaseHTTPRequestHandler, HTTPServer
HITS = {"order": 0, "pay": 0, "cart": 0}
PAGE = """<html><head><title>Shop</title></head><body>
<h1>Fake Shop</h1>
<input id="q" name="q" placeholder="Search products"><button id="s" onclick="location.href='/results?q='+document.getElementById('q').value">Search</button>
</body></html>"""
RESULTS = """<html><body><h1>Results</h1>
<div><span>Basmati Rice 5kg</span> <b>Rs 499</b> <button onclick="fetch('/cart',{method:'POST'}).then(()=>{document.getElementById('m').innerText='Added to cart'})">Add to cart</button></div>
<p id="m"></p><a href="/checkout">Go to checkout</a></body></html>"""
CHECKOUT = """<html><body><h1>Checkout</h1><p>Total Rs 499</p>
<input id="pw" type="password" name="password" placeholder="Password">
<input id="card" name="cardnumber" placeholder="Card number">
<button onclick="fetch('/order',{method:'POST'}).then(()=>{document.getElementById('m').innerText='ORDER PLACED'})">Place order</button>
<button onclick="fetch('/pay',{method:'POST'})">Pay now</button><p id="m"></p></body></html>"""
class H(BaseHTTPRequestHandler):
    def log_message(self,*a): pass
    def do_GET(self):
        body = RESULTS if self.path.startswith("/results") else CHECKOUT if self.path.startswith("/checkout") else PAGE
        self.send_response(200); self.send_header("Content-Type","text/html"); self.end_headers(); self.wfile.write(body.encode())
    def do_POST(self):
        k = self.path.strip("/"); HITS[k] = HITS.get(k,0)+1
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
def start(port=8765):
    s = HTTPServer(("127.0.0.1", port), H); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
