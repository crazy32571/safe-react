import React from 'react'
import { addDecorator } from '@storybook/react'
import { ThemeProvider, createGlobalStyle } from 'styled-components'
import { theme } from '@gnosis.pm/safe-react-components'

import averta from 'src/assets/fonts/Averta-normal.woff2';
import avertaBold from 'src/assets/fonts/Averta-ExtraBold.woff2';


const GlobalStyles = createGlobalStyle`
   @font-face {
        font-family: 'Averta';
        src: local('Averta'), local('Averta Bold'),
        url(${averta}) format('woff2'),
        url(${avertaBold}) format('woff');
    }
`

addDecorator((storyFn) => (
  <ThemeProvider theme={theme}>
    <GlobalStyles />
    {storyFn()}
  </ThemeProvider>
))