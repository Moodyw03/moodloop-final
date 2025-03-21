# Moodloop

[View the live project here.](https://moodloop.netlify.app/)

<div align="center">
<a href="https://ibb.co/ZLLWz7R"><img src="https://i.ibb.co/2nng3H0/moodloop-mockup.jpg" alt="moodloop-mockup" border="0"></a>
</div>

## Overview

Welcome to Moodloop, a web-based stem mixing interface that allows you to create quick tracks by combining different stems and sounds. With Moodloop, you can easily drag or click on arrows to mix up to four different stems, including rhythm, bass, percussion, and synth. Whether you're a music enthusiast, producer, or simply looking to explore your creativity, Moodloop helps you bring your musical ideas to life.

This project represents Milestone Project 2 for the Code Institute's Diploma in Web Application Development program, utilizing HTML, CSS, and JavaScript.

## Features

- **Stem Mixing**: Mix up to four different stems (rhythm, bass, percussion, and synth) simultaneously
- **Drag & Drop Interface**: Easily drag audio files on desktop or use tap arrows on mobile devices
- **Audio Controls**: Play, pause, mute, and solo functionality for each stem
- **Equalizer**: Adjust bass, mid, and treble settings to customize your sound
- **Responsive Design**: Optimized for all device sizes from mobile to desktop
- **Pre-listening**: Preview stems before adding them to your mix
- **Intuitive UI**: Clean interface with clear visual feedback

### Interactive Elements

Moodloop features a responsive design that adapts to various device sizes:

- **Media Queries**: The app uses breakpoints for smartphones, tablets, laptops, and desktop screens
- **Fluid Grids**: Layout elements resize proportionally to the screen
- **Adaptive UI Elements**: Interface components adjust based on device size (e.g., drop-zone replaced by arrow-click buttons on mobile)
- **Flexible Images**: Images resize within containing elements to maintain layout integrity

## User Experience (UX)

### User Stories

#### First Time Visitor Goals

- **Intuitive Understanding**: Immediately grasp how to use the stem mixing interface
- **Seamless Navigation**: Easily explore and find relevant features and stems
- **Joyful Exploration**: Create music without prior experience through an accessible interface

#### Returning Visitor Goals

- **Seamless Continuation**: Quickly continue where they left off or start new creations
- **Enhanced Playability**: Master buffer options, including mute and solo functionalities
- **Resource Discovery**: Explore additional content, tutorials, and community features

#### Frequent User Goals

- **Content Refresh**: Access new samples and stems regularly
- **Feature Exploration**: Discover and integrate newly added features
- **Community Engagement**: Stay informed through newsletters and updates

### Design

<div align="center">
<a href="https://ibb.co/MkKML2G"><img src="https://i.ibb.co/jkqgF6W/moodloop-palette-copy.jpg" alt="moodloop-palette-copy" border="0"></a>
</div>

#### Color Scheme

- **Primary Color** (#20242c): Used for primary buttons, headers, and active navigation
- **Secondary Color** (#6263d7): Used for secondary UI elements and hover states
- **Gradient Colors**: Light Sky Blue (#87CEFA) to Cornflower Blue (#6495ED) for background gradients
- **Text Color** (#5e6267): Ensures readability against the blue background

#### Typography

**Roboto Mono**: A monospaced font that provides precision and technical aesthetic while maintaining readability across the platform.

#### Imagery

The interface features an animated CSS background with shifting gradient colors, providing depth and fluidity to enhance user experience and engagement.

### Wireframes

- [Home Page Wireframe](https://pdfhost.io/v/2JUYSOaP4_moodloop_wireframe)

## Technologies Used

### Languages

- [HTML5](https://en.wikipedia.org/wiki/HTML5)
- [CSS3](https://en.wikipedia.org/wiki/Cascading_Style_Sheets)
- [JavaScript](https://en.wikipedia.org/wiki/JavaScript)

### Frameworks, Libraries & Programs

1. [Bootstrap 5](https://getbootstrap.com/): Used for responsive layout and styling components
2. [Google Fonts](https://fonts.google.com/): Imported Roboto Mono font
3. [Font Awesome](https://fontawesome.com/): Used for icons throughout the interface
4. [jQuery](https://jquery.com/): Used for DOM manipulation and event handling
5. [Git](https://git-scm.com/): Version control
6. [GitHub](https://github.com/): Code repository
7. [Photoshop](https://www.adobe.com/products/photoshop.html): Image editing
8. [Balsamiq](https://balsamiq.com/): Wireframe creation
9. [Vanilla JS](https://vanilla.js.org/): Used for audio context management and drag-and-drop functionality
10. [Vite](https://vitejs.dev/): Build tool for development and production
11. [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API): For audio processing and playback
12. [VSCode](https://code.visualstudio.com/): Development IDE
13. [Netlify](https://www.netlify.com/): Deployment and hosting

## Testing

Comprehensive testing was performed to ensure functionality across devices and browsers. For detailed testing information, please refer to the [testing documentation](TESTING.md).

Key highlights:

- Validated with W3C CSS Validator
- Lighthouse performance testing
- A11y Color Contrast Accessibility checks
- JavaScript validation with JSHint
- Cross-browser testing (Chrome, Firefox, Safari)
- Device testing (desktop, tablet, mobile)

### Known Bugs

- Millisecond delay at the end of each loop due to Web Audio API buffer limitations
- Occasional reduced volume when using the "pre-listen" option on certain audio files

## Deployment

### GitHub Pages

1. Log in to GitHub and locate the [repository](https://github.com/Moodyw03/moodloop-final)
2. Go to Settings > Pages
3. Under "Source", select "Master Branch"
4. The site will be published at the provided URL

### Forking the Repository

1. Log in to GitHub and locate the [repository](https://github.com/Moodyw03/moodloop-final)
2. Click the "Fork" button at the top of the repository
3. You will now have a copy of the repository in your GitHub account

### Local Clone

1. Log in to GitHub and locate the [repository](https://github.com/Moodyw03/moodloop-final)
2. Click "Clone or download"
3. Copy the HTTPS link
4. Open Git Bash and change to your desired directory
5. Run: `git clone https://github.com/Moodyw03/moodloop-final.git`

## Credits

### Content

- All content was written by the developer.

### Acknowledgements

- Code Institute for the education and support
- Web Audio API documentation for audio processing techniques
- Bootstrap documentation for responsive design components
