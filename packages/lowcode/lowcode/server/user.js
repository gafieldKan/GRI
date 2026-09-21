const users = [{ username: 'admin', password: '123456', roles: ['admin'] }]

app.post('/api/login', (req, res) => {
  const { username, password } = req.body
  if (users.find((u) => u.username === username && u.password === password)) {
    res.json({ token: 'mock-token', roles: ['admin'] })
  } else {
    res.status(401).json({ error: 'login failed' })
  }
})
