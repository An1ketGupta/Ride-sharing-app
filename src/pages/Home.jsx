import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Hero from '../sections/landing/Hero'

const Home = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  const handlePrimary = () => navigate('/search')
  const handleSecondary = () => {
    if (user && (user.user_type === 'driver' || user.user_type === 'both')) {
      navigate('/driver/dashboard')
    } else {
      // For unauthenticated users or passengers, direct to register to become a driver/both
      navigate('/register')
    }
  }

  return (
    <div>
      <Hero onPrimary={handlePrimary} onSecondary={handleSecondary} />
    </div>
  )
}

export default Home


