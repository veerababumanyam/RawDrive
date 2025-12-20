"""AI Policy Integration Service.

Generates legal policies (Privacy Policy, Terms of Service) using Company Profile data.
Designed to integrate with LLM services in the future.
"""

import logging
from typing import Literal

from app.api.company_profile_schemas import CompanyProfileResponse
from app.services.company_profile_service import get_company_profile_service

logger = logging.getLogger(__name__)

PolicyType = Literal["privacy", "terms", "refund"]

class AIPolicyService:
    """Service to generate AI-assisted legal policies."""

    @staticmethod
    def generate_policy(profile: CompanyProfileResponse, policy_type: PolicyType) -> str:
        """
        Generate a legal policy based on the company profile.
        
        Args:
            profile: The company profile containing branding and contact info.
            policy_type: Type of policy to generate.
            
        Returns:
            Markdown formatted policy string.
        """
        company_name = profile.name or "Company Name"
        email = profile.email
        website = profile.website or "our website"
        
        # In a real implementation, this would call an LLM with a prompt using these variables.
        # For now, we use robust templates.
        
        if policy_type == "privacy":
            return AIPolicyService._generate_privacy_policy(company_name, email, website)
        elif policy_type == "terms":
            return AIPolicyService._generate_terms_of_service(company_name, email, website)
        elif policy_type == "refund":
            return AIPolicyService._generate_refund_policy(company_name, email)
        else:
            raise ValueError(f"Unsupported policy type: {policy_type}")

    @staticmethod
    def _generate_privacy_policy(company_name: str, email: str, website: str) -> str:
        return f"""# Privacy Policy

**Effective Date:** {company_name}

## 1. Introduction
Welcome to **{company_name}**. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website ({website}) and tell you about your privacy rights.

## 2. Controller
**{company_name}** is the controller and responsible for your personal data.

## 3. Contact Details
If you have any questions about this privacy policy, please contact us:
*   **Email:** {email}

## 4. Data We Collect
We may collect, use, store and transfer different kinds of personal data about you which we have grouped together follows:
*   **Identity Data:** includes first name, last name, username.
*   **Contact Data:** includes email address and telephone numbers.

## 5. How We Use Your Data
We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:
*   Where we need to perform the contract we are about to enter into or have entered into with you.
*   Where it is necessary for our legitimate interests.

## 6. Data Security
We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorized way.

## 7. Your Rights
Under certain circumstances, you have rights under data protection laws in relation to your personal data, including the right to access, correct, or erase your personal data.
"""

    @staticmethod
    def _generate_terms_of_service(company_name: str, email: str, website: str) -> str:
        return f"""# Terms of Service

**Last Updated:** {company_name}

## 1. Agreement to Terms
By accessing or using our services at {website}, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, please do not use our services.

## 2. Intellectual Property Rights
**{company_name}** and its licensors own all the intellectual property rights and materials contained in this Website.

## 3. Restrictions
You are specifically restricted from all of the following:
*   publishing any Website material in any other media;
*   selling, sublicensing and/or otherwise commercializing any Website material;
*   publicly performing and/or showing any Website material;
*   using this Website in any way that is or may be damaging to this Website;

## 4. Limitation of Liability
In no event shall **{company_name}**, nor any of its officers, directors and employees, be held liable for anything arising out of or in any way connected with your use of this Website.

## 5. Governing Law
These Terms will be governed by and interpreted in accordance with the laws of the jurisdiction in which **{company_name}** is located.

## 6. Contact Us
If you have any questions about these Terms, please contact us at {email}.
"""

    @staticmethod
    def _generate_refund_policy(company_name: str, email: str) -> str:
        return f"""# Refund Policy

**Last Updated:** {company_name}

## 1. Returns and Refunds
Thank you for shopping at **{company_name}**.
If you are not entirely satisfied with your purchase, we're here to help.

## 2. Digital Products
We do not issue refunds for digital products once the order is confirmed and the product is sent. We recommend contacting us for assistance if you experience any issues receiving or downloading our products.

## 3. Contact Us
If you have any questions about our Returns and Refunds Policy, please contact us:
*   **Email:** {email}
"""

_ai_policy_service = AIPolicyService()

def get_ai_policy_service() -> AIPolicyService:
    return _ai_policy_service
