*** Settings ***
Library     SeleniumLibrary
Library     RequestsLibrary
Library     Collections
Library     String
Library     Process

*** Variables ***
${BASE_URL}         http://localhost:3000
${API_URL}          http://localhost:8080
${BROWSER}          chrome
${TIMEOUT}          20s
${LOGIN_URL}        ${BASE_URL}/login
${DASHBOARD_URL}    ${BASE_URL}/dashboard
${ADMIN_URL}        ${BASE_URL}/admin/users

*** Keywords ***
Open Browser To Login Page
    ${options}=    Evaluate    sys.modules['selenium.webdriver'].ChromeOptions()    sys
    Call Method    ${options}    add_argument    --no-sandbox
    Call Method    ${options}    add_argument    --disable-dev-shm-usage
    Call Method    ${options}    add_argument    --disable-extensions
    Open Browser    ${LOGIN_URL}    ${BROWSER}    options=${options}
    Set Selenium Timeout    ${TIMEOUT}
    Maximize Browser Window
    Delete All Cookies
    Go To    ${LOGIN_URL}
    Wait Until Element Is Visible    id=login-email    timeout=${TIMEOUT}

Flush Rate Limit Cache
    [Documentation]    Resets the in-memory credential rate limiter and purges refresh sessions
    ...    for all test accounts so MaxSessions never blocks repeat logins.
    Run Process    curl    -s    -o    /dev/null    -X    POST
    ...    ${API_URL}/internal/test/reset-rate-limit
    FOR    ${email}    IN
    ...    superadmin@rawdrive.test
    ...    admin@rawdrive.test
    ...    pho.pro@rawdrive.test
    ...    dealer.tg@rawdrive.test
    ...    mod@rawdrive.test
    ...    pho.starter@rawdrive.test
        Run Process    curl    -s    -o    /dev/null    -X    POST
        ...    ${API_URL}/internal/test/purge-sessions?email\=${email}
    END
    Log    Rate limit reset and test sessions purged

Close Test Browser
    Close All Browsers

Login With Credentials
    [Arguments]    ${email}    ${password}
    Wait Until Element Is Visible    id=login-email    timeout=${TIMEOUT}
    Clear Element Text    id=login-email
    Input Text    id=login-email    ${email}
    Clear Element Text    id=login-password
    Input Text    id=login-password    ${password}
    Click Button    xpath=//button[@type='submit']

Wait For Dashboard
    Wait Until Location Contains    /dashboard    timeout=${TIMEOUT}

Wait For Admin Dashboard
    Wait Until Location Contains    /admin    timeout=${TIMEOUT}

Page Should Show Error
    [Arguments]    ${message}
    Wait Until Element Is Visible    xpath=//*[contains(@class,'feedback-error') and contains(text(),'${message}')]    timeout=${TIMEOUT}
