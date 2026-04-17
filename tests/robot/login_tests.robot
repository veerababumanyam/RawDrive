*** Settings ***
Documentation       RawDrive — User Login Test Suite
...                 Covers happy-path and negative login scenarios for all roles.
...
...                 Prerequisites:
...                   - Frontend running on http://localhost:3000
...                   - Backend running on http://localhost:8080
...                   - Test accounts seeded (password: UatPho@2026)

Resource            resources/common.resource
Suite Setup         Run Keywords    Flush Rate Limit Cache    AND    Open Browser To Login Page
Suite Teardown      Close Test Browser
Test Teardown       Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

*** Variables ***
${VALID_PASSWORD}       UatPho@2026
${WRONG_PASSWORD}       WrongPass@999
${NONEXISTENT_EMAIL}    nobody@rawdrive.test

*** Test Cases ***

# ─────────────────────────────────────────────
# TC-001  Super Admin login
# ─────────────────────────────────────────────
TC-001 Super Admin Can Login And Reach Admin Dashboard
    [Documentation]    Super admin logs in and is redirected to /admin/users
    [Tags]    login    super_admin    smoke
    Login With Credentials    superadmin@rawdrive.test    ${VALID_PASSWORD}
    Wait For Admin Dashboard
    Location Should Contain    /admin
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-002  Admin login
# ─────────────────────────────────────────────
TC-002 Platform Admin Can Login And Reach Admin Dashboard
    [Documentation]    Platform admin logs in and is redirected to /admin/users
    [Tags]    login    admin    smoke
    Login With Credentials    admin@rawdrive.test    ${VALID_PASSWORD}
    Wait For Admin Dashboard
    Location Should Contain    /admin
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-003  Photographer login
# ─────────────────────────────────────────────
TC-003 Photographer Can Login And Reach Studio Dashboard
    [Documentation]    Photographer logs in and is redirected to /dashboard
    [Tags]    login    photographer    smoke
    Login With Credentials    pho.pro@rawdrive.test    ${VALID_PASSWORD}
    Wait For Dashboard
    Location Should Contain    /dashboard
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-004  Dealer login
# ─────────────────────────────────────────────
TC-004 Dealer Can Login And Reach Dealer Dashboard
    [Documentation]    Dealer logs in and is redirected to /dealer
    [Tags]    login    dealer    smoke
    Login With Credentials    dealer.tg@rawdrive.test    ${VALID_PASSWORD}
    Wait Until Location Contains    /dealer    timeout=${TIMEOUT}
    Location Should Contain    /dealer
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-005  Wrong password
# ─────────────────────────────────────────────
TC-005 Login Fails With Wrong Password
    [Documentation]    Submitting an incorrect password shows an error message
    [Tags]    login    negative
    Login With Credentials    superadmin@rawdrive.test    ${WRONG_PASSWORD}
    Wait Until Element Is Visible
    ...    xpath=//*[contains(@class,'feedback-error')]
    ...    timeout=${TIMEOUT}
    Element Should Be Visible    xpath=//*[contains(@class,'feedback-error')]
    Location Should Be    ${LOGIN_URL}
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-006  Non-existent email
# ─────────────────────────────────────────────
TC-006 Login Fails With Non-Existent Email
    [Documentation]    Submitting an email that is not registered shows an error
    [Tags]    login    negative
    Login With Credentials    ${NONEXISTENT_EMAIL}    ${VALID_PASSWORD}
    Wait Until Element Is Visible
    ...    xpath=//*[contains(@class,'feedback-error')]
    ...    timeout=${TIMEOUT}
    Element Should Be Visible    xpath=//*[contains(@class,'feedback-error')]
    Location Should Be    ${LOGIN_URL}
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-007  Empty fields
# ─────────────────────────────────────────────
TC-007 Submit Button Is Disabled When Fields Are Empty
    [Documentation]    The Sign In button must be disabled when email/password are blank
    [Tags]    login    negative    ui
    Wait Until Element Is Visible    id=login-email    timeout=${TIMEOUT}
    Element Should Be Disabled    xpath=//button[@type='submit']
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-008  Empty password only
# ─────────────────────────────────────────────
TC-008 Submit Button Is Disabled When Password Is Empty
    [Documentation]    Button stays disabled when email is filled but password is blank
    [Tags]    login    negative    ui
    Wait Until Element Is Visible    id=login-email    timeout=${TIMEOUT}
    Input Text    id=login-email    superadmin@rawdrive.test
    Element Should Be Disabled    xpath=//button[@type='submit']
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-009  Telangana admin login
# ─────────────────────────────────────────────
TC-009 Admin Mod (Telangana) Can Login
    [Documentation]    State-scoped admin mod logs in successfully
    [Tags]    login    admin    state
    Login With Credentials    mod@rawdrive.test    ${VALID_PASSWORD}
    Wait For Admin Dashboard
    Location Should Contain    /admin
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache

# ─────────────────────────────────────────────
# TC-010  Starter photographer login
# ─────────────────────────────────────────────
TC-010 Free Tier Photographer Can Login
    [Documentation]    Free-tier photographer logs in and reaches studio dashboard
    [Tags]    login    photographer    free_tier
    Login With Credentials    pho.starter@rawdrive.test    ${VALID_PASSWORD}
    Wait For Dashboard
    Location Should Contain    /dashboard
    [Teardown]    Run Keywords    Delete All Cookies    AND    Go To    ${LOGIN_URL}    AND    Flush Rate Limit Cache
